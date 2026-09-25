// Zipped OME-Zarr (RFC-9 `.ozx`) archives as in-memory zarrita stores. Pure
// byte and string handling with no DOM access so Node unit tests can
// exercise it; the ngff-zarr reader that consumes the store lives in
// load-image.ts.
//
// zarrita addresses a store by absolute path (`/zarr.json`, `/0/c/0/0`).
// ngff-zarr's `memoryStoreToZip` strips that leading slash when it writes an
// archive, so reading mirrors it: every entry name gets exactly one leading
// slash back. Normalising this way also covers an archive whose entries
// already start with `/` (which a naive prefix would turn into `//zarr.json`),
// so no separate un-prefixed lookup is needed.
import type { FromOmeZarrOptions } from '@fideus-labs/ngff-zarr/browser'
import { unzipSync } from 'fflate'

/**
 * In-memory zarrita store: absolute keys (leading `/`) to file bytes. The
 * same shape as ngff-zarr's `MemoryStore`, declared here so this module
 * stays importable without the browser entry point.
 */
export type MemoryStore = Map<string, Uint8Array>

/** A byte range of one store entry, as zarrita's `Readable.getRange` takes it. */
export type ByteRange = { offset: number; length: number } | { suffixLength: number }

/**
 * A {@link MemoryStore} that also answers range requests. zarrita reads
 * `sharding_indexed` arrays (the layout the OME 2024 NGFF challenge and
 * ngff-zarr's `chunksPerShard` produce) through `getRange`, and refuses a
 * store without it, so a plain Map could not open a sharded archive.
 *
 * Every value handed out starts at byte offset 0 of its own buffer: zarrita
 * builds typed arrays (a `BigUint64Array` shard index, `Int16Array` pixels)
 * directly over the bytes it gets, and a view into the middle of a larger
 * buffer throws "start offset should be a multiple of N". Ranges are
 * therefore copies, and {@link memoryStoreFromZip} stores standalone
 * buffers rather than fflate's views into the archive.
 */
export class OzxMemoryStore extends Map<string, Uint8Array> {
  async getRange(key: string, range: ByteRange): Promise<Uint8Array | undefined> {
    const data = this.get(key)
    if (data === undefined) {
      return undefined
    }
    if ('suffixLength' in range) {
      return data.slice(Math.max(0, data.byteLength - range.suffixLength))
    }
    return data.slice(range.offset, range.offset + range.length)
  }
}

/** `data` itself when it owns its whole buffer, else a standalone copy. */
function standalone(data: Uint8Array): Uint8Array {
  return data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice()
}

/** OME-Zarr versions the ngff-zarr reader accepts as a `version` hint. */
export type OmeZarrVersion = NonNullable<FromOmeZarrOptions['version']>

const OME_ZARR_VERSIONS: readonly OmeZarrVersion[] = ['0.4', '0.5', '0.6', '0.9.dev1']

/** Root document of a Zarr v3 store; RFC-9 requires it as the first entry. */
export const ROOT_METADATA_KEY = '/zarr.json'

/**
 * Narrow the version string `readOzxVersion` pulls from the archive comment
 * to the `version` option of `fromOmeZarr`. A missing or unrecognised
 * version yields `undefined` so the reader detects it from the metadata.
 */
export function omeZarrVersionOption(version: string | null | undefined): OmeZarrVersion | undefined {
  return OME_ZARR_VERSIONS.find((known) => known === version)
}

/**
 * Directory prefix (`name/`) to strip when the archive wraps the store in a
 * single top-level directory, as zipping a `brain.ome.zarr/` folder does:
 * there is no root `zarr.json`, but `<dir>/zarr.json` exists and every
 * entry lives under `<dir>/`. Returns `''` when the store is at the root
 * or no such wrapper exists.
 */
export function archiveRootPrefix(names: readonly string[]): string {
  if (names.includes('zarr.json')) {
    return ''
  }
  const candidates = names
    .filter((name) => /^[^/]+\/zarr\.json$/.test(name))
    .map((name) => name.slice(0, name.indexOf('/') + 1))
  return candidates.find((prefix) => names.every((name) => name.startsWith(prefix))) ?? ''
}

/**
 * Unzip an RFC-9 `.ozx` archive into an {@link OzxMemoryStore}. Directory
 * entries are dropped, leading slashes normalised to exactly one, and a
 * single wrapper directory (see {@link archiveRootPrefix}) removed. Throws
 * when the result has no root `zarr.json`, which no OME-Zarr store lacks.
 */
export function memoryStoreFromZip(zipData: Uint8Array): OzxMemoryStore {
  const files = new Map<string, Uint8Array>()
  for (const [rawName, data] of Object.entries(unzipSync(zipData))) {
    if (rawName.endsWith('/')) {
      continue
    }
    const name = rawName.replace(/^\/+/, '')
    if (name !== '') {
      files.set(name, data)
    }
  }
  const prefix = archiveRootPrefix([...files.keys()])
  const store = new OzxMemoryStore()
  for (const [name, data] of files) {
    store.set(`/${name.slice(prefix.length)}`, standalone(data))
  }
  if (!store.has(ROOT_METADATA_KEY)) {
    throw new Error('The archive has no root zarr.json, so it is not a zipped OME-Zarr (.ozx) store')
  }
  return store
}
