// A read-only zarrita store over HTTP that finds a file's end without
// trusting Content-Length. Pure fetch and header handling with no DOM
// access so Node unit tests can exercise it; load-image.ts hands it to
// ngff-zarr's reader for OME-Zarr URLs.
//
// A sharded array keeps each shard's index at the end of the shard, so
// zarrita asks for a suffix range. zarrita's own FetchStore answers that
// either with a `bytes=-N` request, which Vite's static server (sirv, behind
// `pnpm dev` and `pnpm preview`) misreads as `bytes=0-N`, or with a HEAD
// whose Content-Length it takes as the file size. GitHub Pages gzips whole
// `application/octet-stream` responses, so that Content-Length is the
// compressed size: the index is read from the wrong offset and every chunk
// range decoded from it comes back 416. This store learns the size from the
// Content-Range total of a `bytes=0-0` request instead, which no server
// compresses, and reads the suffix as an explicit byte range, which every
// static server handles.
import type { ByteRange } from './ozx-store.ts'

type Fetch = typeof globalThis.fetch

/** The total length in a `Content-Range: bytes 0-0/1234` header, or null when absent or unknown (`*`). */
export function contentRangeTotal(header: string | null): number | null {
  const match = header?.match(/\/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

export class RangeFetchStore {
  readonly url: URL
  readonly #fetch: Fetch
  /** File sizes by URL, so each shard is measured once however many of its chunks are read. */
  readonly #sizes = new Map<string, Promise<number | undefined>>()

  constructor(url: string | URL, fetchImpl: Fetch = (...args) => globalThis.fetch(...args)) {
    this.url = new URL(url)
    // Keys resolve under the store, so the root must read as a directory.
    if (!this.url.pathname.endsWith('/')) {
      this.url.pathname += '/'
    }
    this.#fetch = fetchImpl
  }

  /** The URL of an absolute store key (`/0/c/0/0/0`), keeping the root's query string. */
  resolve(key: string): string {
    const resolved = new URL(key.replace(/^\/+/, ''), this.url)
    resolved.search = this.url.search
    return resolved.href
  }

  async get(key: string, init: RequestInit = {}): Promise<Uint8Array | undefined> {
    return bodyOf(await this.#fetch(this.resolve(key), init))
  }

  async getRange(key: string, range: ByteRange, init: RequestInit = {}): Promise<Uint8Array | undefined> {
    const url = this.resolve(key)
    let offset: number
    let length: number
    if ('suffixLength' in range) {
      const size = await this.#size(url, init)
      if (size === undefined) {
        return undefined
      }
      length = Math.min(range.suffixLength, size)
      offset = size - length
    } else {
      ;({ offset, length } = range)
    }
    if (length === 0) {
      return new Uint8Array(0)
    }
    const response = await this.#fetch(url, withRange(init, `bytes=${offset}-${offset + length - 1}`))
    const bytes = await bodyOf(response)
    // A server that ignores Range sends the whole file; cut out the range,
    // as a standalone copy since zarrita builds typed arrays over it.
    return response.status === 200 && bytes ? bytes.slice(offset, offset + length) : bytes
  }

  #size(url: string, init: RequestInit): Promise<number | undefined> {
    let size = this.#sizes.get(url)
    if (size === undefined) {
      size = this.#measure(url, init)
      this.#sizes.set(url, size)
      // A failed measurement is retried on the next read rather than cached.
      size.catch(() => this.#sizes.delete(url))
    }
    return size
  }

  async #measure(url: string, init: RequestInit): Promise<number | undefined> {
    const response = await this.#fetch(url, withRange(init, 'bytes=0-0'))
    if (response.status === 206) {
      await response.body?.cancel()
      const total = contentRangeTotal(response.headers.get('Content-Range'))
      if (total !== null) {
        return total
      }
      // Cross-origin, Content-Range is hidden unless the server exposes it.
      // Fall back to a HEAD's Content-Length, as zarrita's FetchStore does:
      // right for an uncompressed host, wrong for one that also compresses,
      // which the page cannot detect (Content-Encoding is hidden too).
      // Measuring a decoded GET instead would download every shard whole.
      const head = await this.#fetch(url, { ...init, method: 'HEAD' })
      if (head.status === 404) {
        return undefined
      }
      const length = Number(head.headers.get('Content-Length'))
      if (!head.ok || !Number.isFinite(length) || head.headers.get('Content-Length') === null) {
        throw new Error(`Cannot determine the size of ${url}`)
      }
      return length
    }
    // A server that ignores Range answers 200 with the file, decoded.
    const bytes = await bodyOf(response)
    return bytes?.length
  }
}

function withRange(init: RequestInit, range: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Range', range)
  return { ...init, headers }
}

/** The body of a 200 or 206 response; undefined for a 404, which in a Zarr store is a chunk never written. */
async function bodyOf(response: Response): Promise<Uint8Array | undefined> {
  if (response.status === 404) {
    await response.body?.cancel()
    return undefined
  }
  if (response.status === 200 || response.status === 206) {
    return new Uint8Array(await response.arrayBuffer())
  }
  await response.body?.cancel()
  throw new Error(`Unexpected response status ${response.status} ${response.statusText} for ${response.url}`)
}
