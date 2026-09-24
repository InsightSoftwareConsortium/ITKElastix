import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { reducedStoreMetadata, shardEntry } from './ome-zarr-select.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, '..', 'public', 'samples');
const strict = process.argv.includes('--strict');

/** Files downloaded as they are, from the first gateway that answers. */
const files = [
  {
    name: 'tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz',
    gateways: [
      // TemplateFlow's own S3 bucket first: the public IPFS gateways below
      // rate-limit (HTTP 429, Retry-After 900 s) after a few requests.
      'https://templateflow.s3.amazonaws.com/tpl-MNI152NLin2009aSym',
      'https://w3s.link/ipfs/bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry',
      'https://bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry.ipfs.w3s.link',
      'https://ipfs.io/ipfs/bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry',
    ],
  },
  {
    name: 'tpl-MNI305_T1w.nii.gz',
    gateways: [
      'https://templateflow.s3.amazonaws.com/tpl-MNI305',
      'https://w3s.link/ipfs/bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry',
      'https://bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry.ipfs.w3s.link',
      'https://ipfs.io/ipfs/bafybeiabjayndqcwxyxymqg3766m57eikfcs42fyhp66vexsbrjecxmkry',
    ],
  },
];

// A time-lapse from the OME-NGFF data resources
// (https://ngff.openmicroscopy.org/resources/data/): IDR idr0051, a
// zebrafish tailbud from the 18-somite stage with H2B-labelled nuclei,
// imaged by light sheet every 2 min (Attardi et al. 2018,
// doi:10.1242/dev.166728; CC BY 4.0). Each pair is two time points of the
// recording, so the tissue's own motion between them is what the
// registration recovers.
const ZEBRAFISH_TAILBUD =
  'https://livingobjects.ebi.ac.uk/idr/zarr/v0.5/idr0051/180712_H2B_22ss_Courtney1_20180712-163837_p00_c00_preview.zarr/0';

/**
 * OME-Zarr stores written from one time point (and, for 2D, one z plane) of
 * a remote image, reusing its encoded chunks (see scripts/ome-zarr-select.mjs).
 */
const stores = [
  // The plane IDR shows by default (its rdefs.defaultZ), 40 min apart: the tail shifts as it extends.
  { name: 'zebrafish-tailbud-z100_t00.ome.zarr', source: ZEBRAFISH_TAILBUD, selection: { t: 0, c: 0, z: 100 } },
  { name: 'zebrafish-tailbud-z100_t20.ome.zarr', source: ZEBRAFISH_TAILBUD, selection: { t: 20, c: 0, z: 100 } },
  // The whole z-stacks of the same two time points.
  { name: 'zebrafish-tailbud_t00.ome.zarr', source: ZEBRAFISH_TAILBUD, selection: { t: 0, c: 0 } },
  { name: 'zebrafish-tailbud_t20.ome.zarr', source: ZEBRAFISH_TAILBUD, selection: { t: 20, c: 0 } },
];

/**
 * One request with a timeout that also covers reading the body, so a
 * download that stalls part-way is aborted too. Resolves with the status
 * whatever it is, and the body's bytes only for a successful response.
 */
async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadFile(name, gateways) {
  const targetPath = path.join(samplesDir, name);

  // Skip if file already exists and is non-empty
  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    if (stats.size > 0) {
      console.log(`✓ ${name} (${formatBytes(stats.size)}) already exists`);
      return true;
    }
  }

  let lastError;

  // Try each gateway with one retry
  for (const gateway of gateways) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `${gateway}/${name}`;
        console.log(`  Fetching from ${url}...`);

        const response = await fetchWithTimeout(url, 120_000);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          // A rate-limited gateway will not recover within this run, so move
          // on to the next one instead of retrying it immediately.
          if (response.status === 429) break;
          continue;
        }

        const { bytes } = response;

        if (bytes.length === 0) {
          lastError = new Error('Empty response');
          continue;
        }

        // Write atomically: temp file then rename. The temp file lives next to
        // the target so the rename never crosses filesystems (os.tmpdir() is
        // often a separate mount, which makes renameSync throw EXDEV).
        const tempPath = `${targetPath}.download`;
        fs.writeFileSync(tempPath, bytes);
        fs.renameSync(tempPath, targetPath);

        console.log(`✓ ${name} (${formatBytes(bytes.length)})`);
        return true;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          console.log(`  Retry ${attempt + 1}... (${err?.message || err})`);
        }
      }
    }
  }

  console.error(`✗ ${name}: ${lastError?.message || 'unknown error'}`);
  return false;
}

/**
 * The bytes at `url`, with one retry; null for a 404, which in a Zarr store
 * is a chunk that was never written (all fill value). A time point's shard
 * is several MB from a slow host, hence the long timeout.
 */
async function fetchStoreBytes(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, 300_000);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.bytes;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * The bytes of `url` in `range` (an HTTP Range value), with one retry; null
 * for a 404. A server that ignores Range sends the whole body, which
 * `sliceWhole` cuts down to the range.
 */
async function fetchStoreRange(url, range, sliceWhole) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, 300_000, { headers: { Range: range } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.status === 206 ? response.bytes : sliceWhole(response.bytes);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Shard indexes already read, by shard URL, for the inner chunks that share a shard. */
const shardIndexes = new Map();

/**
 * One inner chunk of the shard at `url`: its index first (at the shard's
 * start or end), then the chunk's own byte range; null for a missing shard
 * or an inner chunk that was never written.
 */
async function fetchInnerChunk(url, { entry, layout }) {
  if (!shardIndexes.has(url)) {
    const { byteLength, location } = layout;
    const index =
      location === 'start'
        ? await fetchStoreRange(url, `bytes=0-${byteLength - 1}`, (bytes) => bytes.subarray(0, byteLength))
        : await fetchStoreRange(url, `bytes=-${byteLength}`, (bytes) => bytes.subarray(bytes.length - byteLength));
    shardIndexes.set(url, index);
  }
  const index = shardIndexes.get(url);
  const chunk = index === null ? null : shardEntry(index, entry);
  if (chunk === null) return null;
  const end = chunk.offset + chunk.byteLength;
  return fetchStoreRange(url, `bytes=${chunk.offset}-${end - 1}`, (bytes) => bytes.subarray(chunk.offset, end));
}

async function fetchStoreJson(url) {
  const bytes = await fetchStoreBytes(url);
  return bytes === null ? null : JSON.parse(new TextDecoder().decode(bytes));
}

function writeStoreFile(root, relativePath, bytes) {
  const filePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return bytes.length;
}

/** Write the reduced copy of `source` described by `selection` as the store `name`. */
async function deriveStore({ name, source, selection, levels }) {
  const targetPath = path.join(samplesDir, name);
  // The store is renamed into place only once complete, so its presence means it is whole.
  if (fs.existsSync(targetPath)) {
    console.log(`✓ ${name} already exists`);
    return true;
  }
  const tempPath = `${targetPath}.download`;
  try {
    console.log(`  Reading ${source} at ${JSON.stringify(selection)}...`);
    const v3 = await fetchStoreJson(`${source}/zarr.json`);
    const zarrFormat = v3 ? 3 : 2;
    const attributes = v3 ? v3.attributes : await fetchStoreJson(`${source}/.zattrs`);
    if (!attributes) throw new Error(`No OME-Zarr group at ${source}`);
    const multiscale = zarrFormat === 3 ? attributes.ome?.multiscales?.[0] : attributes.multiscales?.[0];
    const arrays = {};
    for (const { path: datasetPath } of multiscale?.datasets ?? []) {
      if (levels && !levels.includes(datasetPath)) continue;
      const meta = await fetchStoreJson(`${source}/${datasetPath}/${zarrFormat === 3 ? 'zarr.json' : '.zarray'}`);
      if (!meta) throw new Error(`No array at ${source}/${datasetPath}`);
      arrays[datasetPath] = meta;
    }
    const plan = reducedStoreMetadata({ zarrFormat, attributes, arrays, selection, levels, source });

    fs.rmSync(tempPath, { recursive: true, force: true });
    let bytesWritten = 0;
    for (const [relativePath, value] of plan.files) {
      bytesWritten += writeStoreFile(tempPath, relativePath, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
    }
    for (const { path: datasetPath, copies } of plan.arrays) {
      for (const copy of copies) {
        const url = `${source}/${datasetPath}/${copy.source}`;
        const bytes = copy.inner ? await fetchInnerChunk(url, copy.inner) : await fetchStoreBytes(url);
        if (bytes !== null) {
          bytesWritten += writeStoreFile(tempPath, `${datasetPath}/${copy.target}`, bytes);
        }
      }
    }
    fs.renameSync(tempPath, targetPath);
    console.log(`✓ ${name} (${formatBytes(bytesWritten)})`);
    return true;
  } catch (err) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    console.error(`✗ ${name}: ${err?.message || err}`);
    return false;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  // Ensure samples directory exists
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  console.log(`Fetching samples to ${samplesDir}\n`);

  let allSuccess = true;
  for (const file of files) {
    if (!(await downloadFile(file.name, file.gateways))) {
      allSuccess = false;
    }
  }
  for (const store of stores) {
    if (!(await deriveStore(store))) {
      allSuccess = false;
    }
  }

  if (!allSuccess && strict) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
