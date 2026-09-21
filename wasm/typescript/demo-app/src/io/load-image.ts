// Ingest pipeline foundation: any ITK-Wasm-readable image (File or URL) ->
// ITK-Wasm Image -> in-memory OME-Zarr multiscales (ngff-zarr) -> the finest
// scale that fits the pixel budget -> scalar 2D/3D ITK-Wasm Image for elastix.
//
// This follows the read side of fidnii's examples/convert/converter.ts
// (`convertImage`). Keep this module free of DOM access so tests and web
// workers can reuse it; UI code lives in src/ui/.
import type { Image } from 'itk-wasm'
import { readImage } from '@itk-wasm/image-io'
import {
  bytesOnlyCodecs,
  itkImageToNgffImage,
  Methods,
  ngffImageToItkImage,
  toMultiscales,
  type Multiscales,
  type NgffImage,
} from '@fideus-labs/ngff-zarr/browser'
import {
  PIXEL_BUDGET_BYTES,
  ngffImageBytes,
  planScaleFactors,
  selectScaleForBudget,
} from './scale-select'

export { PIXEL_BUDGET_BYTES } from './scale-select'

/** Everything the app keeps for one loaded input image. */
export interface LoadedImage {
  /** File name (or URL-derived name) used for format detection and labels. */
  name: string
  /** Spatial dimension of {@link itkImage}, the image elastix receives. */
  dimension: 2 | 3
  /** Full in-memory pyramid; later phases render or export other levels. */
  multiscales: Multiscales
  /** Index into `multiscales.images` of the level chosen for registration. */
  scaleIndex: number
  /** The chosen level, still carrying any 'c'/'t' dims. */
  ngffImage: NgffImage
  /** Scalar 2D or 3D image (t=0, c=0 of the chosen level) for elastix. */
  itkImage: Image
  /** Byte size of `itkImage.data`. */
  registrationBytes: number
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

/** Zarr chunk edge length for the in-memory arrays. */
export const INGEST_CHUNK_SIZE = 128

// File formats whose headers carry a direction matrix, so anatomical
// orientation metadata (RFC 4) can be trusted. Compound extensions must be
// listed alongside their bare forms because matching is by suffix.
const ORIENTATION_EXTENSIONS = [
  '.nii',
  '.nii.gz',
  '.nrrd',
  '.nhdr',
  '.mha',
  '.mhd',
  '.mnc',
  '.mnc.gz',
  '.gipl',
  '.gipl.gz',
  '.hdf5',
  '.h5',
  '.fdf',
  '.mgh',
  '.mgz',
  '.img',
  '.img.gz',
  '.hdr',
  '.hdr.gz',
  '.dcm',
  '.dicom',
]

/**
 * Whether the file name suggests a format that stores anatomical
 * orientation. DICOM slices are often stored without an extension or with a
 * numeric one, so those count too.
 */
export function hasOrientationExtension(name: string): boolean {
  const lower = name.toLowerCase()
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (ORIENTATION_EXTENSIONS.some((extension) => base.endsWith(extension))) {
    return true
  }
  return !base.includes('.') || /\.\d+$/.test(base)
}

/** File name portion of a URL, without query or fragment. */
export function nameFromUrl(url: string): string {
  const path = url.split(/[?#]/, 1)[0]
  const name = path.slice(path.lastIndexOf('/') + 1)
  return decodeURIComponent(name) || 'image'
}

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readSourceBytes(
  source: ImageSource,
  report: (message: string, loadedBytes: number, totalBytes?: number) => void,
): Promise<{ name: string; data: Uint8Array }> {
  if (source instanceof File) {
    const data = new Uint8Array(await source.arrayBuffer())
    report(`Read ${formatBytes(data.byteLength)} from ${source.name}`, data.byteLength, data.byteLength)
    return { name: source.name, data }
  }
  const name = source.name || nameFromUrl(source.url)
  const data = await fetchBytes(source.url, (loadedBytes, totalBytes) => {
    const total = totalBytes === undefined ? '' : ` / ${formatBytes(totalBytes)}`
    report(`Downloading ${name}: ${formatBytes(loadedBytes)}${total}`, loadedBytes, totalBytes)
  })
  return { name, data }
}

/**
 * Load an image from a File or URL and prepare it for registration.
 *
 * Steps: fetch bytes -> `readImage` (ITK-Wasm, worker terminated afterwards)
 * -> `itkImageToNgffImage` -> `toMultiscales` with isotropic factors chosen
 * so the last level fits {@link PIXEL_BUDGET_BYTES} -> pick the finest level
 * that fits -> `ngffImageToItkImage` at t=0, c=0 so elastix always receives a
 * scalar 2D or 3D image.
 */
export async function loadImageSource(
  source: ImageSource,
  onProgress?: LoadProgressCallback,
): Promise<LoadedImage> {
  const report = (stage: LoadStage, message: string, extra: Partial<LoadProgress> = {}) => {
    onProgress?.({ stage, message, ...extra })
  }

  report('fetch', source instanceof File ? `Reading ${source.name}…` : `Fetching ${source.name}…`)
  const { name, data } = await readSourceBytes(source, (message, loadedBytes, totalBytes) => {
    report('fetch', message, { loadedBytes, totalBytes })
  })

  report('read', `Decoding ${name}…`)
  const { image, webWorker } = await readImage({ data, path: name })
  ;(webWorker as Worker | null)?.terminate()

  return ingestItkImage(image, name, onProgress)
}

/**
 * Run the ingest steps that follow `readImage` on an in-memory ITK-Wasm
 * image: OME-Zarr conversion, budgeted multiscale generation, scale
 * selection, and extraction of the scalar 2D/3D image elastix receives.
 * Later phases feed images from non-file sources through here.
 */
export async function ingestItkImage(
  image: Image,
  name: string,
  onProgress?: LoadProgressCallback,
): Promise<LoadedImage> {
  const report = (stage: LoadStage, message: string) => {
    onProgress?.({ stage, message })
  }

  report('convert', 'Converting to OME-Zarr…')
  const sourceDimension = image.imageType.dimension
  const baseImage = await itkImageToNgffImage(image, {
    addAnatomicalOrientation: sourceDimension === 3 && hasOrientationExtension(name),
    chunks: INGEST_CHUNK_SIZE,
  })

  const scaleFactors = planScaleFactors(baseImage, PIXEL_BUDGET_BYTES)
  report(
    'downsample',
    scaleFactors.length === 0
      ? `Image fits the ${formatBytes(PIXEL_BUDGET_BYTES)} budget; keeping full resolution`
      : `Downsampling ${scaleFactors.length} level${scaleFactors.length === 1 ? '' : 's'} (÷${scaleFactors.join(', ÷')})…`,
  )
  // An empty scaleFactors array yields a single-level pyramid holding the
  // base image (verified in ngff-zarr 0.33 downsampleItkWasm), so no separate
  // createMultiscales path is needed.
  const multiscales = await toMultiscales(baseImage, {
    scaleFactors,
    method: Methods.ITKWASM_GAUSSIAN,
    codecs: bytesOnlyCodecs(),
    chunks: INGEST_CHUNK_SIZE,
  })

  report('select', 'Selecting registration scale…')
  const scaleIndex = selectScaleForBudget(multiscales, PIXEL_BUDGET_BYTES)
  const ngffImage = multiscales.images[scaleIndex]
  const itkImage = await ngffImageToItkImage(ngffImage, {
    tIndex: ngffImage.dims.includes('t') ? 0 : undefined,
    cIndex: ngffImage.dims.includes('c') ? 0 : undefined,
  })
  const dimension = itkImage.imageType.dimension
  if (dimension !== 2 && dimension !== 3) {
    throw new Error(`Expected a 2D or 3D image after ingest, got ${dimension}D (${name})`)
  }
  const registrationBytes = itkImage.data?.byteLength ?? ngffImageBytes(ngffImage)

  report(
    'done',
    `Loaded ${name}: ${dimension}D ${itkImage.size.join('×')} at scale ${scaleIndex} (${formatBytes(registrationBytes)})`,
  )
  return { name, dimension, multiscales, scaleIndex, ngffImage, itkImage, registrationBytes }
}
