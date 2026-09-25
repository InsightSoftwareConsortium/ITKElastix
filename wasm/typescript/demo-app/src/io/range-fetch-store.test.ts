// Unit tests for the HTTP store that reads shard indexes without trusting
// Content-Length. Each fake server answers the way a real host does: GitHub
// Pages (gzipped whole responses, correct ranges), a server that ignores
// Range, and a cross-origin host that hides Content-Range. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contentRangeTotal, RangeFetchStore } from './range-fetch-store.ts'

const FILE = Uint8Array.from({ length: 1000 }, (_, i) => i % 251)
const ROOT = 'https://example.org/samples/image.ome.zarr'
const SHARD = `${ROOT}/0/c/0/0/0`

interface Options {
  /** Answer whole-file responses as gzip does, with a smaller Content-Length. */
  gzip?: boolean
  /** Ignore Range headers and always send the whole file. */
  ignoreRange?: boolean
  /** Hide Content-Range, as a cross-origin response does unless the server exposes it. */
  hideContentRange?: boolean
  /** Status of a HEAD, and whether it carries Content-Length. */
  head?: { status: number; contentLength: boolean }
  /** Reject this many requests as a network failure first. */
  failFirst?: number
}

/** A fake fetch serving FILE at SHARD, and the Range and method of every request it saw. */
function fakeServer({
  gzip = false,
  ignoreRange = false,
  hideContentRange = false,
  head = { status: 200, contentLength: true },
  failFirst = 0,
}: Options = {}) {
  const requests: string[] = []
  let failures = failFirst
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const range = new Headers(init.headers).get('Range')
    const method = init.method ?? 'GET'
    requests.push(`${method} ${range ?? ''}`.trim())
    if (failures > 0) {
      failures -= 1
      throw new TypeError('Failed to fetch')
    }
    if (url !== SHARD) {
      return new Response(null, { status: 404 })
    }
    if (method === 'HEAD' && (head.status !== 200 || !head.contentLength)) {
      return new Response(null, { status: head.status })
    }
    const match = range?.match(/^bytes=(\d+)-(\d+)$/)
    if (match && !ignoreRange) {
      const start = Number(match[1])
      const end = Math.min(Number(match[2]), FILE.length - 1)
      if (start >= FILE.length) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${FILE.length}` } })
      }
      const headers: Record<string, string> = hideContentRange
        ? {}
        : { 'Content-Range': `bytes ${start}-${end}/${FILE.length}` }
      return new Response(FILE.slice(start, end + 1), { status: 206, headers })
    }
    // A whole-file response. Under gzip the header counts compressed bytes,
    // while the body the browser hands back is decoded.
    const headers = { 'Content-Length': String(gzip ? 700 : FILE.length) }
    return new Response(method === 'HEAD' ? null : FILE.slice(), { status: 200, headers })
  }) as typeof fetch
  return { fetchImpl, requests }
}

test('contentRangeTotal reads the total length and rejects an unknown one', () => {
  assert.equal(contentRangeTotal('bytes 0-0/13327317'), 13327317)
  assert.equal(contentRangeTotal('bytes */1000'), 1000)
  assert.equal(contentRangeTotal('bytes 0-0/*'), null)
  assert.equal(contentRangeTotal(null), null)
})

test('resolves keys under the store root, with or without its trailing slash', () => {
  assert.equal(new RangeFetchStore(ROOT).resolve('/0/zarr.json'), `${ROOT}/0/zarr.json`)
  assert.equal(new RangeFetchStore(`${ROOT}/`).resolve('/zarr.json'), `${ROOT}/zarr.json`)
  assert.equal(new RangeFetchStore(`${ROOT}?token=1`).resolve('/zarr.json'), `${ROOT}/zarr.json?token=1`)
})

test('reads a shard index from the true end of a file a gzipping host serves (GitHub Pages)', async () => {
  const { fetchImpl, requests } = fakeServer({ gzip: true })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 20 }), FILE.slice(980))
  // The size comes from Content-Range, never from a HEAD's Content-Length.
  assert.deepEqual(requests, ['GET bytes=0-0', 'GET bytes=980-999'])
})

test('measures each file once across suffix reads', async () => {
  const { fetchImpl, requests } = fakeServer()
  const store = new RangeFetchStore(ROOT, fetchImpl)
  await store.getRange('/0/c/0/0/0', { suffixLength: 20 })
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 4 }), FILE.slice(996))
  assert.deepEqual(requests, ['GET bytes=0-0', 'GET bytes=980-999', 'GET bytes=996-999'])
})

test('reads offset ranges as explicit byte ranges', async () => {
  const { fetchImpl, requests } = fakeServer()
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { offset: 10, length: 5 }), FILE.slice(10, 15))
  assert.deepEqual(requests, ['GET bytes=10-14'])
})

test('cuts ranges out of the whole file when the server ignores Range', async () => {
  const { fetchImpl } = fakeServer({ ignoreRange: true, gzip: true })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 20 }), FILE.slice(980))
  const range = await store.getRange('/0/c/0/0/0', { offset: 10, length: 5 })
  assert.deepEqual(range, FILE.slice(10, 15))
  // zarrita builds typed arrays over what it gets, so a range must be a standalone buffer.
  assert.equal(range?.byteOffset, 0)
  assert.equal(range?.buffer.byteLength, 5)
})

test('falls back to a HEAD when Content-Range is hidden cross-origin', async () => {
  const { fetchImpl, requests } = fakeServer({ hideContentRange: true })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 20 }), FILE.slice(980))
  assert.deepEqual(requests, ['GET bytes=0-0', 'HEAD', 'GET bytes=980-999'])
})

test('clamps a suffix longer than the file to the whole file', async () => {
  const { fetchImpl } = fakeServer()
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 5000 }), FILE)
})

test('answers undefined for a missing key and throws on other failures', async () => {
  const { fetchImpl } = fakeServer()
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.equal(await store.get('/missing'), undefined)
  assert.equal(await store.getRange('/missing', { suffixLength: 20 }), undefined)
  await assert.rejects(store.getRange('/0/c/0/0/0', { offset: 5000, length: 5 }), /416/)
})

test('gets a whole key', async () => {
  const { fetchImpl, requests } = fakeServer({ gzip: true })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.get('/0/c/0/0/0'), FILE)
  assert.deepEqual(requests, ['GET'])
})

test('answers undefined when the HEAD fallback finds no file', async () => {
  const { fetchImpl } = fakeServer({ hideContentRange: true, head: { status: 404, contentLength: false } })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.equal(await store.getRange('/0/c/0/0/0', { suffixLength: 20 }), undefined)
})

test('throws when the HEAD fallback cannot give a size', async () => {
  for (const head of [
    { status: 500, contentLength: false },
    { status: 200, contentLength: false },
  ]) {
    const { fetchImpl } = fakeServer({ hideContentRange: true, head })
    const store = new RangeFetchStore(ROOT, fetchImpl)
    await assert.rejects(store.getRange('/0/c/0/0/0', { suffixLength: 20 }), /Cannot determine the size/)
  }
})

test('retries a size check that failed instead of caching the failure', async () => {
  const { fetchImpl, requests } = fakeServer({ failFirst: 1 })
  const store = new RangeFetchStore(ROOT, fetchImpl)
  await assert.rejects(store.getRange('/0/c/0/0/0', { suffixLength: 20 }), /Failed to fetch/)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { suffixLength: 20 }), FILE.slice(980))
  assert.deepEqual(requests, ['GET bytes=0-0', 'GET bytes=0-0', 'GET bytes=980-999'])
})

test('answers an empty range without a request', async () => {
  const { fetchImpl, requests } = fakeServer()
  const store = new RangeFetchStore(ROOT, fetchImpl)
  assert.deepEqual(await store.getRange('/0/c/0/0/0', { offset: 10, length: 0 }), new Uint8Array(0))
  assert.deepEqual(requests, [])
})
