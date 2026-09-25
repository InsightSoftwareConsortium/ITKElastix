// Ingest pipeline: a source router with a shared tail. Every input format
// converges on the same last steps ("multiscales -> the finest scale under
// the pixel budget -> scalar 2D/3D ITK-Wasm Image for elastix"), and
// {@link finalizeFromMultiscales} is that tail. Each source kind
// ({@link detectSourceKind}) has its own head that produces the multiscales:
//
// - `itk`: any ITK-Wasm-readable File or URL -> `readImage` ->
//   `itkImageToNgffImage` -> `toMultiscales` (Phase 01 path).
// - `tiff`: a TIFF or OME-TIFF File or URL -> `@fideus-labs/fiff`'s
//   TiffStore (src/io/tiff-store.ts), which synthesizes OME-Zarr 0.5
//   metadata over the IFDs -> `fromOmeZarr`, with deflate decoding on a
//   `@fideus-labs/worker-pool` pool.
// - `ozx`: a zipped OME-Zarr (RFC-9) File or URL -> bytes -> `unzipSync`
//   into a `MemoryStore` (src/io/ozx-store.ts) -> `fromOmeZarr`.
// - `ome-zarr-url`: an OME-Zarr directory store URL -> `fromOmeZarr`, which
//   reads it lazily through zarrita's FetchStore.
//
// The tail ends by normalizing the level for elastix (src/io/normalize.ts):
// one time point and one channel, with a single-slice volume squeezed to
// 2D, so the pair check in the splash sees comparable scalar images.
//
// This follows the read side of fidnii's examples/convert/converter.ts
// (`convertImage`). Keep this module free of DOM access so tests and web
// workers can reuse it; UI code lives in src/ui/.
import type { Image } from 'itk-wasm'
import { WorkerPool } from '@fideus-labs/worker-pool'
import { readImage } from '@itk-wasm/image-io'
import {
  bytesOnlyCodecs,
  fromOmeZarr,
  itkImageToNgffImage,
  Methods,
  ngffImageToItkImage,
  readOzxVersion,
  toMultiscales,
  type ChunkCache,
  type Multiscales,
  type NgffImage,
} from '@fideus-labs/ngff-zarr/browser'
import { formatBytes } from '../format'
import { memoryStoreFromZip, omeZarrVersionOption } from './ozx-store'
import {
  channelAndTimepointInfo,
  fillMissingTranslation,
  normalizeForRegistration,
  registrationSliceOptions,
  type SpatialAxis,
} from './normalize'
import {
  PIXEL_BUDGET_BYTES,
  estimateLevelBytes,
  largeInputWarning,
  planScaleFactors,
  selectScaleForBudget,
} from './scale-select'
import {
  detectSourceKind,
  hasOrientationExtension,
  nameFromUrl,
  sourceFormatForKind,
  type SourceFormat,
  type SourceKind,
} from './source-kind'
import { isOmeTiffStore, openTiffStore, TIFF_STORE_VERSION, tiffPoolSize, tiffStoreAsOmeZarrStore } from './tiff-store'

export {
  REGISTRATION_CHANNEL_INDEX,
  REGISTRATION_TIMEPOINT_INDEX,
  assertCompatiblePair,
  squeezeSingletonAxis,
  type RegistrationInput,
  type SpatialAxis,
} from './normalize'
export { LARGE_INPUT_BYTES, PIXEL_BUDGET_BYTES } from './scale-select'
export {
  detectSourceKind,
  hasOrientationExtension,
  nameFromUrl,
  sourceFormatForKind,
  type SourceFormat,
  type SourceKind,
} from './source-kind'

/** Everything the app keeps for one loaded input image. */
export interface LoadedImage {
  /** File name (or URL-derived name) used for format detection and labels. */
  name: string
  /** Reader the source was routed to; see {@link detectSourceKind}. */
  kind: SourceKind
  /**
   * Format the source was read as, for display (ITK, OME-Zarr, OZX, TIFF,
   * OME-TIFF); see {@link sourceFormatForKind}.
   */
  format: SourceFormat
  /** Spatial dimension of {@link itkImage}, the image elastix receives. */
  dimension: 2 | 3
  /** Full in-memory pyramid; later phases render or export other levels. */
  multiscales: Multiscales
  /** Index into `multiscales.images` of the level chosen for registration. */
  scaleIndex: number
  /** The chosen level, still carrying any 'c'/'t' dims. */
  ngffImage: NgffImage
  /**
   * Scalar 2D or 3D image for elastix: t=0, c=0 of the chosen level, with a
   * single-slice volume squeezed to 2D (see src/io/normalize.ts).
   */
  itkImage: Image
  /** Byte size of `itkImage`'s pixel buffer: what elastix actually receives. */
  registrationBytes: number
  /** Pixel budget, in bytes, that scale selection used for this image. */
  budgetBytes: number
  /** Extent of the source's 'c' axis; 1 when it has none. */
  channelCount: number
  /** Channel that `itkImage` holds. */
  channelIndex: number
  /** Extent of the source's 't' axis; 1 when it has none. */
  timepointCount: number
  /** Axis dropped when the chosen level was a single-slice volume. */
  squeezedAxis?: SpatialAxis
  /**
   * The File or URL the image was read from, when it came through
   * {@link loadImageSource}, so it can be loaded again under another pixel
   * budget (src/ui/reload-flow.ts). Absent for an image ingested from
   * memory ({@link ingestItkImage}).
   */
  source?: ImageSource
}

/** A user-picked File or a URL plus the file name to read it as. */
export type ImageSource = File | { url: string; name: string }

export type LoadStage = 'fetch' | 'read' | 'convert' | 'downsample' | 'select' | 'done'

export interface LoadProgress {
  stage: LoadStage
  message: string
  /** Bytes received so far; only reported while fetching. */
  loadedBytes?: number
  /** Total bytes when the server sent Content-Length; may be absent. */
  totalBytes?: number
}

export type LoadProgressCallback = (progress: LoadProgress) => void

export interface LoadImageOptions {
  /**
   * Largest buffer, in bytes, handed to elastix; the pyramid is extended
   * and the registration scale chosen so the image fits. Defaults to
   * {@link PIXEL_BUDGET_BYTES}; `?budget=<MiB>` on the page URL overrides it.
   */
  budgetBytes?: number
  onProgress?: LoadProgressCallback
  /**
   * Receives a warning that does not stop the load: today, that the image
   * is larger than {@link LARGE_INPUT_BYTES} at full resolution and about
   * to be downsampled, which is slow and memory-hungry.
   */
  onWarning?: (message: string) => void
}

/** Zarr chunk edge length for the in-memory arrays. */
export const INGEST_CHUNK_SIZE = 128

/**
 * Decoded-chunk cache shared by every OME-Zarr read, so a level that is
 * read again (the same remote pyramid loaded as fixed and moving, or a
 * reload after a failed pair) is served from memory. Passed as the `cache`
 * option of `fromOmeZarr`; ngff-zarr 0.33's browser reader accepts it and
 * only its OMERO statistics path consumes it, so today this is a
 * forward-compatible no-op rather than a memory concern.
 */
const chunkCache: ChunkCache = new Map()

/**
 * Fetch a URL into memory. When the response carries Content-Length the body
 * is streamed so `onProgress` can report byte counts; otherwise the body is
 * read in one go and reported once at the end.
 */
export async function fetchBytes(
  url: string,
  onProgress?: (loadedBytes: number, totalBytes?: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  if (response.body === null) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress?.(bytes.byteLength, bytes.byteLength)
    return bytes
  }
  // Content-Length counts bytes on the wire. When the body is content-encoded
  // (Vite's dev server sends *.gz with `Content-Encoding: gzip`) the stream
  // yields decoded bytes, so the header is not a usable total.
  const encoding = response.headers.get('Content-Encoding')
  const lengthHeader = response.headers.get('Content-Length')
  const contentLength = lengthHeader === null ? Number.NaN : Number.parseInt(lengthHeader, 10)
  const totalBytes =
    (encoding === null || encoding === 'identity') && Number.isFinite(contentLength) && contentLength > 0
      ? contentLength
      : undefined

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    receivedBytes += value.byteLength
    onProgress?.(receivedBytes, totalBytes)
  }
  const bytes = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Display name of a source: the File's name or the URL's last segment. */
export function sourceName(source: ImageSource): string {
  return source instanceof File ? source.name : source.name || nameFromUrl(source.url)
}

/** URL a source is fetched from, or undefined for a local File. */
export function sourceUrl(source: ImageSource): string | undefined {
  return source instanceof File ? undefined : source.url
}

/** Progress reporter bound to one load; `extra` carries byte counts. */
type Reporter = (stage: LoadStage, message: string, extra?: Partial<LoadProgress>) => void

function makeReporter(onProgress?: LoadProgressCallback): Reporter {
  return (stage, message, extra = {}) => {
    onProgress?.({ stage, message, ...extra })
  }
}

/** Read a File or fetch a URL into memory, reporting byte progress. */
export async function readSourceBytes(source: ImageSource, onProgress?: LoadProgressCallback): Promise<Uint8Array> {
  const report = makeReporter(onProgress)
  const name = sourceName(source)
  if (source instanceof File) {
    report('fetch', `Reading ${name}…`)
    const data = new Uint8Array(await source.arrayBuffer())
    report('fetch', `Read ${formatBytes(data.byteLength)} from ${name}`, {
      loadedBytes: data.byteLength,
      totalBytes: data.byteLength,
    })
    return data
  }
  report('fetch', `Fetching ${name}…`)
  return fetchBytes(source.url, (loadedBytes, totalBytes) => {
    const total = totalBytes === undefined ? '' : ` / ${formatBytes(totalBytes)}`
    report('fetch', `Downloading ${name}: ${formatBytes(loadedBytes)}${total}`, { loadedBytes, totalBytes })
  })
}

/**
 * Load an image from a File or URL and prepare it for registration.
 *
 * Routes on {@link detectSourceKind} to a format-specific head that builds
 * the multiscales pyramid, then finishes with {@link finalizeFromMultiscales}
 * so every kind yields the same {@link LoadedImage}.
 */
export async function loadImageSource(source: ImageSource, options: LoadImageOptions = {}): Promise<LoadedImage> {
  const name = sourceName(source)
  const kind = detectSourceKind(name, sourceUrl(source))
  const image = await sourceLoaders[kind](source, name, options)
  return { ...image, source }
}

/** Head for one source kind: everything up to and including the shared tail. */
type SourceLoader = (source: ImageSource, name: string, options: LoadImageOptions) => Promise<LoadedImage>

const sourceLoaders: Record<SourceKind, SourceLoader> = {
  itk: loadItkSource,
  tiff: loadTiffSource,
  ozx: loadOzxSource,
  'ome-zarr-url': loadOmeZarrUrlSource,
}

/**
 * The `itk` head: bytes -> `readImage` (ITK-Wasm; its worker is terminated
 * afterwards) -> {@link ingestItkImage}.
 */
async function loadItkSource(source: ImageSource, name: string, options: LoadImageOptions): Promise<LoadedImage> {
  const report = makeReporter(options.onProgress)
  const data = await readSourceBytes(source, options.onProgress)

  report('read', `Decoding ${name}…`)
  const { image, webWorker } = await readImage({ data, path: name })
  ;(webWorker as Worker | null)?.terminate()

  return ingestItkImage(image, name, options)
}

/**
 * The `ozx` head: a zipped OME-Zarr (RFC-9) File, or a remote `.ozx` fetched
 * with progress, is unzipped whole into a `MemoryStore` and read with
 * `fromOmeZarr`. The version hint comes from the archive comment when
 * `readOzxVersion` finds one; otherwise the reader detects it.
 */
async function loadOzxSource(source: ImageSource, name: string, options: LoadImageOptions): Promise<LoadedImage> {
  const report = makeReporter(options.onProgress)
  const data = await readSourceBytes(source, options.onProgress)

  report('read', `Unzipping ${name}…`)
  const store = memoryStoreFromZip(data)
  const version = omeZarrVersionOption(readOzxVersion(data))

  report('read', `Reading OME-Zarr metadata from ${name}…`)
  const multiscales = await fromOmeZarr(store, { version, cache: chunkCache })
  return finalizeFromMultiscales(name, multiscales, options.budgetBytes, options.onProgress, 'ozx')
}

/**
 * The `tiff` head: a TIFF or OME-TIFF opened as a fiff `TiffStore`
 * (`fromBlob` for a File, `fromUrl` for a URL, which is then read with
 * HTTP range requests rather than downloaded whole) and handed to
 * `fromOmeZarr` as the OME-Zarr 0.5 store it synthesizes, exactly as
 * fidnii's `fromTiff` does. Plain TIFF, OME-TIFF, and SubIFD pyramids all
 * arrive this way; only the level {@link finalizeFromMultiscales} selects
 * is decoded.
 *
 * Deflate-compressed tiles are decoded on a worker pool sized to the core
 * count so the main thread stays free. The pool is created per load and
 * its workers terminated once the registration scale has been converted
 * (`return await` keeps the `finally` after the conversion). fiff registers
 * the pool with geotiff globally, and a terminated pool only loses its idle
 * workers, so a later read of another level from this image's
 * `multiscales` still works: the pool spawns fresh workers on demand.
 */
async function loadTiffSource(source: ImageSource, name: string, options: LoadImageOptions): Promise<LoadedImage> {
  const report = makeReporter(options.onProgress)
  const pool = new WorkerPool(tiffPoolSize())
  try {
    report('fetch', source instanceof File ? `Opening ${name}…` : `Opening ${name} with range requests…`)
    const store = await openTiffStore(source instanceof File ? source : absoluteStoreUrl(source.url), { pool })

    const format: SourceFormat = isOmeTiffStore(store) ? 'OME-TIFF' : 'TIFF'
    const levels = `${store.levels} level${store.levels === 1 ? '' : 's'}`
    report('read', `Reading ${format} metadata from ${name} (${levels})…`)
    const multiscales = await fromOmeZarr(tiffStoreAsOmeZarrStore(store), {
      version: TIFF_STORE_VERSION,
      cache: chunkCache,
    })
    return await finalizeFromMultiscales(name, multiscales, options.budgetBytes, options.onProgress, 'tiff', format)
  } finally {
    pool.terminateWorkers()
  }
}

/**
 * The `ome-zarr-url` head: a remote OME-Zarr directory store read lazily
 * through zarrita's FetchStore. Only the metadata documents are fetched
 * here; {@link finalizeFromMultiscales} then pulls the chunks of the one
 * level it selects, so a large pyramid is never downloaded whole.
 */
async function loadOmeZarrUrlSource(
  source: ImageSource,
  name: string,
  options: LoadImageOptions,
): Promise<LoadedImage> {
  if (source instanceof File) {
    throw new Error(
      `${name} looks like an OME-Zarr directory store, which a file picker cannot read; enter its URL or zip it as .ozx`,
    )
  }
  const report = makeReporter(options.onProgress)
  report('fetch', `Reading OME-Zarr metadata from ${name}…`)
  const multiscales = await fromOmeZarr(absoluteStoreUrl(source.url), { cache: chunkCache })
  return finalizeFromMultiscales(name, multiscales, options.budgetBytes, options.onProgress, 'ome-zarr-url')
}

/**
 * The browser reader only accepts `http(s)://` strings, so a root-relative
 * URL (the dev server's own `/samples/...`) is resolved against the page.
 * Where there is no page (a worker without a location) the URL must
 * already be absolute.
 */
export function absoluteStoreUrl(url: string): string {
  return new URL(url, globalThis.location?.href).href
}

/**
 * Build the budgeted multiscales pyramid for an in-memory ITK-Wasm image:
 * `itkImageToNgffImage`, then `toMultiscales` with isotropic factors chosen
 * so the last level fits the budget. Returns the pyramid for
 * {@link finalizeFromMultiscales}.
 */
export async function multiscalesFromItkImage(
  image: Image,
  name: string,
  { budgetBytes = PIXEL_BUDGET_BYTES, onProgress, onWarning }: LoadImageOptions = {},
): Promise<Multiscales> {
  const report = makeReporter(onProgress)

  report('convert', 'Converting to OME-Zarr…')
  const sourceDimension = image.imageType.dimension
  const baseImage = await itkImageToNgffImage(image, {
    addAnatomicalOrientation: sourceDimension === 3 && hasOrientationExtension(name),
    chunks: INGEST_CHUNK_SIZE,
  })

  // Warn before the downsampling starts, which is where a very large
  // image spends its time and memory.
  const warning = largeInputWarning(name, estimateLevelBytes(baseImage, 1), budgetBytes)
  if (warning !== null) {
    onWarning?.(warning)
  }

  const scaleFactors = planScaleFactors(baseImage, budgetBytes)
  report(
    'downsample',
    scaleFactors.length === 0
      ? `Image fits the ${formatBytes(budgetBytes)} budget; keeping full resolution`
      : `Downsampling ${scaleFactors.length} level${scaleFactors.length === 1 ? '' : 's'} (÷${scaleFactors.join(', ÷')})…`,
  )
  // An empty scaleFactors array yields a single-level pyramid holding the
  // base image (verified in ngff-zarr 0.33 downsampleItkWasm), so no separate
  // createMultiscales path is needed.
  return toMultiscales(baseImage, {
    scaleFactors,
    method: Methods.ITKWASM_GAUSSIAN,
    codecs: bytesOnlyCodecs(),
    chunks: INGEST_CHUNK_SIZE,
  })
}

/**
 * Run the ingest steps that follow `readImage` on an in-memory ITK-Wasm
 * image: {@link multiscalesFromItkImage}, then the shared tail. Images that
 * arrive from non-file sources can be fed through here.
 */
export async function ingestItkImage(image: Image, name: string, options: LoadImageOptions = {}): Promise<LoadedImage> {
  const multiscales = await multiscalesFromItkImage(image, name, options)
  return finalizeFromMultiscales(name, multiscales, options.budgetBytes, options.onProgress)
}

/**
 * The shared tail of every ingest path. Picks the finest pyramid level that
 * fits `budgetBytes`, extracts it with `ngffImageToItkImage` at t=0, c=0 so
 * elastix always receives a scalar image, and normalizes it (a single-slice
 * volume becomes 2D; the result must be 2D or 3D; see src/io/normalize.ts).
 * Only the chosen level's chunks are read, so a lazily backed pyramid (a
 * remote store) never has to be pulled whole. `kind` records which head
 * produced the pyramid and `format` the label shown for it, which defaults
 * to the kind's own ({@link sourceFormatForKind}); the `tiff` head passes
 * 'OME-TIFF' when the file carried OME-XML.
 */
export async function finalizeFromMultiscales(
  name: string,
  multiscales: Multiscales,
  budgetBytes: number = PIXEL_BUDGET_BYTES,
  onProgress?: LoadProgressCallback,
  kind: SourceKind = 'itk',
  format: SourceFormat = sourceFormatForKind(kind),
): Promise<LoadedImage> {
  const report = makeReporter(onProgress)

  for (const image of multiscales.images) {
    fillMissingTranslation(image)
  }
  report('select', 'Selecting registration scale…')
  const scaleIndex = selectScaleForBudget(multiscales, budgetBytes)
  const ngffImage = multiscales.images[scaleIndex]
  const levelImage = await ngffImageToItkImage(ngffImage, registrationSliceOptions(ngffImage))
  const { itkImage, dimension, registrationBytes, squeezedAxis } = normalizeForRegistration(levelImage, name)
  const { channelCount, channelIndex, timepointCount } = channelAndTimepointInfo(ngffImage)

  const squeezed = squeezedAxis === undefined ? '' : `, single ${squeezedAxis} slice squeezed to 2D`
  report(
    'done',
    `Loaded ${name}: ${dimension}D ${itkImage.size.join('×')} at scale ${scaleIndex} of ${multiscales.images.length} (${formatBytes(registrationBytes)}${squeezed})`,
  )
  return {
    name,
    kind,
    format,
    dimension,
    multiscales,
    scaleIndex,
    ngffImage,
    itkImage,
    registrationBytes,
    budgetBytes,
    channelCount,
    channelIndex,
    timepointCount,
    squeezedAxis,
  }
}
