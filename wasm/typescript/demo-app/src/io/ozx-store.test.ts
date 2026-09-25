// Unit tests for the OZX archive -> MemoryStore helper. Archives are built
// with fflate's zipSync the way ngff-zarr's memoryStoreToZip does (stored,
// un-prefixed entry names). Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { zipSync } from 'fflate'

import {
  archiveRootPrefix,
  memoryStoreFromZip,
  omeZarrVersionOption,
  OzxMemoryStore,
  ROOT_METADATA_KEY,
} from './ozx-store.ts'

const encoder = new TextEncoder()

function bytes(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text) as Uint8Array<ArrayBuffer>
}

/** A minimal two-level store the way memoryStoreToZip lays it out. */
function storeEntries(prefix = ''): Record<string, Uint8Array<ArrayBuffer>> {
  return {
    [`${prefix}zarr.json`]: bytes('{"zarr_format":3,"node_type":"group"}'),
    [`${prefix}0/zarr.json`]: bytes('{"zarr_format":3,"node_type":"array"}'),
    [`${prefix}0/c/0/0`]: new Uint8Array([1, 2, 3]),
  }
}

test('memoryStoreFromZip prefixes every entry with one slash', () => {
  const store = memoryStoreFromZip(zipSync(storeEntries(), { level: 0 }))
  assert.deepEqual([...store.keys()].sort(), ['/0/c/0/0', '/0/zarr.json', '/zarr.json'])
  assert.ok(store.has(ROOT_METADATA_KEY))
  assert.deepEqual([...store.get('/0/c/0/0')!], [1, 2, 3])
})

test('memoryStoreFromZip does not double a slash the archive already carries', () => {
  const store = memoryStoreFromZip(zipSync(storeEntries('/'), { level: 0 }))
  assert.deepEqual([...store.keys()].sort(), ['/0/c/0/0', '/0/zarr.json', '/zarr.json'])
})

test('memoryStoreFromZip drops directory entries', () => {
  const entries = { ...storeEntries(), '0/': new Uint8Array(0), '0/c/': new Uint8Array(0) }
  const store = memoryStoreFromZip(zipSync(entries, { level: 0 }))
  assert.deepEqual([...store.keys()].sort(), ['/0/c/0/0', '/0/zarr.json', '/zarr.json'])
})

test('memoryStoreFromZip strips a single wrapper directory', () => {
  const store = memoryStoreFromZip(zipSync(storeEntries('brain.ome.zarr/'), { level: 0 }))
  assert.deepEqual([...store.keys()].sort(), ['/0/c/0/0', '/0/zarr.json', '/zarr.json'])
})

test('memoryStoreFromZip reads deflated entries too', () => {
  const store = memoryStoreFromZip(zipSync(storeEntries(), { level: 6 }))
  assert.equal(new TextDecoder().decode(store.get('/zarr.json')), '{"zarr_format":3,"node_type":"group"}')
})

test('memoryStoreFromZip yields a Map that also answers range requests', async () => {
  const entries = { ...storeEntries(), '0/c/0/0': new Uint8Array([10, 11, 12, 13, 14, 15]) }
  const store = memoryStoreFromZip(zipSync(entries, { level: 0 }))
  assert.ok(store instanceof Map)
  assert.ok(store instanceof OzxMemoryStore)
  assert.deepEqual([...(await store.getRange('/0/c/0/0', { offset: 1, length: 3 }))!], [11, 12, 13])
  assert.deepEqual([...(await store.getRange('/0/c/0/0', { suffixLength: 2 }))!], [14, 15])
  // Ranges past the end are clipped rather than thrown, like a subarray.
  assert.deepEqual([...(await store.getRange('/0/c/0/0', { offset: 4, length: 10 }))!], [14, 15])
  assert.deepEqual([...(await store.getRange('/0/c/0/0', { suffixLength: 100 }))!], [10, 11, 12, 13, 14, 15])
  assert.equal(await store.getRange('/0/c/9/9', { offset: 0, length: 1 }), undefined)
})

test('memoryStoreFromZip hands out buffers zarrita can build typed arrays over', async () => {
  // Stored (level 0) entries come out of fflate as views into the archive;
  // zarrita needs each chunk and shard index at offset 0 of its own buffer.
  const entries = { ...storeEntries(), '0/c/0/0': new Uint8Array(24).fill(7) }
  const store = memoryStoreFromZip(zipSync(entries, { level: 0 }))
  for (const [key, data] of store) {
    assert.equal(data.byteOffset, 0, key)
    assert.equal(data.buffer.byteLength, data.byteLength, key)
  }
  const chunk = store.get('/0/c/0/0')!
  assert.doesNotThrow(() => new BigUint64Array(chunk.buffer, chunk.byteOffset, 3))
  const index = (await store.getRange('/0/c/0/0', { suffixLength: 16 }))!
  assert.equal(index.byteOffset, 0)
  assert.doesNotThrow(() => new BigUint64Array(index.buffer, index.byteOffset, 2))
  const middle = (await store.getRange('/0/c/0/0', { offset: 3, length: 8 }))!
  assert.equal(middle.byteOffset, 0)
  assert.doesNotThrow(() => new BigUint64Array(middle.buffer, 0, 1))
})

test('memoryStoreFromZip rejects an archive without a root zarr.json', () => {
  const entries = { 'README.md': bytes('not a store'), 'a/zarr.json': bytes('{}'), 'b/zarr.json': bytes('{}') }
  assert.throws(() => memoryStoreFromZip(zipSync(entries, { level: 0 })), /root zarr\.json/)
})

test('archiveRootPrefix finds a wrapper only when every entry sits under it', () => {
  assert.equal(archiveRootPrefix(['zarr.json', '0/zarr.json']), '')
  assert.equal(archiveRootPrefix(['x/zarr.json', 'x/0/zarr.json', 'x/0/c/0/0']), 'x/')
  assert.equal(archiveRootPrefix(['x/zarr.json', 'y/0/zarr.json']), '')
  // A nested store is not hoisted past a root that also has zarr.json.
  assert.equal(archiveRootPrefix(['zarr.json', 'x/zarr.json']), '')
  assert.equal(archiveRootPrefix([]), '')
})

test('omeZarrVersionOption narrows the archive comment version', () => {
  assert.equal(omeZarrVersionOption('0.5'), '0.5')
  assert.equal(omeZarrVersionOption('0.4'), '0.4')
  assert.equal(omeZarrVersionOption('0.6'), '0.6')
  assert.equal(omeZarrVersionOption('0.9.dev1'), '0.9.dev1')
  assert.equal(omeZarrVersionOption('0.3'), undefined)
  assert.equal(omeZarrVersionOption(null), undefined)
  assert.equal(omeZarrVersionOption(undefined), undefined)
})
