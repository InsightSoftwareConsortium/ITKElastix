import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, '..', 'public', 'samples');
const strict = process.argv.includes('--strict');

const samples = [
  {
    name: 'CT_2D_head_fixed.mha',
    gateways: [
      'https://bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4.ipfs.w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input',
      'https://w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input',
    ],
  },
  {
    name: 'CT_2D_head_moving.mha',
    gateways: [
      'https://bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4.ipfs.w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input',
      'https://w3s.link/ipfs/bafybeiclckkwabcpcgh3yo5fun2omc6jiloe3x43p6cvj4ctsyxiuwo6c4/data/input',
    ],
  },
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        const response = await fetch(url, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          // A rate-limited gateway will not recover within this run, so move
          // on to the next one instead of retrying it immediately.
          if (response.status === 429) break;
          continue;
        }

        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);

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
  for (const sample of samples) {
    const success = await downloadFile(sample.name, sample.gateways);
    if (!success) {
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
