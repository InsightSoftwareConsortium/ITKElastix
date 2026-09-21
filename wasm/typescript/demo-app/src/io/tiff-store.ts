// TIFF and OME-TIFF files as zarrita stores, through @fideus-labs/fiff's
// TiffStore: it indexes the IFDs (SubIFD pyramids included) and synthesizes
// OME-Zarr v0.5 metadata over them, so the same `fromOmeZarr` reader that
// handles OZX archives and directory stores also reads TIFF, and chunk
// reads stay lazy (one tile or strip at a time, by HTTP range request for
// a URL). Modeled on fidnii's src/fromTiff.ts. No DOM access, so Node unit
// tests can open an in-memory TIFF; the worker pool and the reader call
// live in load-image.ts.
import { TiffStore, type DeflatePool, type TiffStoreOptions } from '@fideus-labs/fiff'
import type { fromOmeZarr } from '@fideus-labs/ngff-zarr/browser'
import type { WorkerPool } from '@fideus-labs/worker-pool'
import { fromArrayBuffer, fromBlob, fromUrl, type GeoTIFF } from 'geotiff'

export type { DeflatePool, TiffStore, TiffStoreOptions } from '@fideus-labs/fiff'

/** OME-Zarr version of the metadata TiffStore synthesizes. */
export const TIFF_STORE_VERSION = '0.5' as const

/** Deflate worker count when the runtime does not report its core count. */
export const DEFAULT_TIFF_POOL_SIZE = 4

/**
 * Worker count for a reported core count: the count itself when it is a
 * positive integer, else {@link DEFAULT_TIFF_POOL_SIZE}.
 */
export function poolSizeForCores(hardwareConcurrency: number | undefined): number {
  if (typeof hardwareConcurrency === 'number' && Number.isInteger(hardwareConcurrency) && hardwareConcurrency > 0) {
    return hardwareConcurrency
  }
  return DEFAULT_TIFF_POOL_SIZE
}

/**
 * Number of deflate-decoding workers for one TIFF read:
 * `navigator.hardwareConcurrency ?? 4`, read from the global navigator that
 * windows, workers, and Node 21+ all provide (see {@link poolSizeForCores}).
 */
export function tiffPoolSize(): number {
  return poolSizeForCores(globalThis.navigator?.hardwareConcurrency)
}

/**
 * A TIFF to open: a local Blob or File (sliced on demand), bytes already in
 * memory, or a URL read with range requests.
 */
export type TiffSource = Blob | ArrayBuffer | string

/**
 * Options for {@link openTiffStore}: fiff's `TiffStoreOptions`, with `pool`
 * also taking a worker-pool `WorkerPool` as is. The two agree at runtime
 * (fiff's decode tasks receive the pool's idle worker or `null`, spawn one
 * when `null`, and hand back the worker they used), but worker-pool 2.x
 * types its slots as `WorkerLike` (a browser `Worker` or a Node worker)
 * while fiff 0.7's `DeflatePool` still spells `Worker`, so the structural
 * check fails on that parameter and the cast is made here, once.
 */
export interface OpenTiffStoreOptions extends Omit<TiffStoreOptions, 'pool'> {
  pool?: DeflatePool | WorkerPool
}

function toTiffStoreOptions({ pool, ...rest }: OpenTiffStoreOptions): TiffStoreOptions {
  return pool === undefined ? rest : { ...rest, pool: pool as unknown as DeflatePool }
}

/** The geotiff 2.x entry point fiff 0.7 still calls, and where geotiff 3.x keeps it. */
interface LegacyIfdParsing {
  parser?: { parseFileDirectoryAt(offset: number): Promise<unknown> }
  parseFileDirectoryAt?: (offset: number) => Promise<unknown>
}

/**
 * Make SubIFD pyramid levels readable. fiff 0.7 reaches the sub-resolution
 * IFDs of an OME-TIFF pyramid through `GeoTIFF.parseFileDirectoryAt`, a
 * geotiff 2.x internal that every geotiff 3.x release (fiff's own `^3.0.3`
 * range included) moved onto `GeoTIFF.parser`, so every level but the
 * first fails with "tiff.parseFileDirectoryAt is not a function". Putting
 * the old entry point back on the instance, delegating to the parser,
 * lets fiff's indexer parse the level and build its `GeoTIFFImage` from
 * the parsed directory the same way geotiff 3's own `getImage` does. A
 * no-op once fiff or geotiff no longer needs it.
 */
export function withSubIfdSupport(tiff: GeoTIFF): GeoTIFF {
  const instance = tiff as unknown as LegacyIfdParsing
  const { parser } = instance
  if (typeof instance.parseFileDirectoryAt !== 'function' && typeof parser?.parseFileDirectoryAt === 'function') {
    instance.parseFileDirectoryAt = (offset) => parser.parseFileDirectoryAt(offset)
  }
  return tiff
}

/**
 * Open a TIFF as a {@link TiffStore}. The GeoTIFF is opened the way fiff's
 * own `TiffStore.fromBlob` / `fromArrayBuffer` / `fromUrl` do it (geotiff
 * `fromBlob` slices a local file through `FileReader`, so Node callers pass
 * an `ArrayBuffer`; `fromUrl` fetches on demand with HTTP range requests
 * rather than downloading the file whole), given {@link withSubIfdSupport},
 * and handed to `TiffStore.fromGeoTIFF`. Only the IFD headers (and the
 * OME-XML, when present) are read here; pixels are pulled chunk by chunk as
 * the store's `get` is called. `options.pool` moves deflate decoding onto
 * that worker pool.
 */
export async function openTiffStore(source: TiffSource, options: OpenTiffStoreOptions = {}): Promise<TiffStore> {
  const storeOptions = toTiffStoreOptions(options)
  let tiff: GeoTIFF
  if (typeof source === 'string') {
    tiff = await fromUrl(source, { headers: storeOptions.headers })
  } else if (source instanceof ArrayBuffer) {
    tiff = await fromArrayBuffer(source)
  } else {
    tiff = await fromBlob(source)
  }
  return TiffStore.fromGeoTIFF(withSubIfdSupport(tiff), storeOptions)
}

/** Whether the file carried OME-XML, so it is an OME-TIFF rather than a plain TIFF. */
export function isOmeTiffStore(store: TiffStore): boolean {
  return store.ome.length > 0
}

/** The store argument of the browser `fromOmeZarr`. */
export type OmeZarrStore = Parameters<typeof fromOmeZarr>[0]

/**
 * A TiffStore as the zarrita `Readable` that `fromOmeZarr` takes. TiffStore
 * satisfies the interface structurally (its `get` accepts the leading-slash
 * absolute keys zarrita uses) but does not declare it, so this is the same
 * `as unknown as Readable` cast fidnii's `fromTiff` makes, kept in one
 * place.
 */
export function tiffStoreAsOmeZarrStore(store: TiffStore): OmeZarrStore {
  return store as unknown as OmeZarrStore
}
