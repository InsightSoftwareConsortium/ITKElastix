// Write the registered image in the format the picker chose. Three writers,
// dispatched on the registry's `kind` (src/io/formats.ts):
//
// - `ozx`: the image as an OME-Zarr 0.6 pyramid zipped into an RFC-9
//   `.ozx`, with the fixed-to-moving transform embedded on its multiscales
//   entry as an RFC-5 affine (src/io/rfc5-transform.ts).
// - `ome-tiff`: the same pyramid written by `@fideus-labs/fiff` as a
//   deflate-compressed OME-TIFF (a sub-resolution IFD per extra level).
// - `itk`: `@itk-wasm/image-io`'s `writeImage`, keyed on the file
//   extension (src/io/export.ts), except `iwi.cbor`, which is encoded in
//   JavaScript so multi-byte pixels keep their byte order (src/io/iwi-cbor.ts).
//
// The pyramid is built the way ingest builds one (`multiscalesFromItkImage`
// in src/io/load-image.ts): `itkImageToNgffImage` at the ingest chunk size,
// then `toMultiscales` with the budget-driven factors, Gaussian smoothing,
// and uncompressed intermediate arrays. The decisions (orientation, factors,
// file name, progress counts) live in src/io/export-plan.ts so the Node
// unit tests can cover them; this module is the wiring, and it imports the
// browser entry points, so only the Playwright specs run it.
import { toOmeTiff, type WriteOptions as OmeTiffWriteOptions } from '@fideus-labs/fiff'
import {
  bytesOnlyCodecs,
  itkImageToNgffImage,
  Methods,
  NgffImage,
  toMultiscales,
  toOmeZarrOzx,
  zarrGet,
  type Multiscales,
} from '@fideus-labs/ngff-zarr/browser'
import { WorkerPool } from '@fideus-labs/worker-pool'
import type { Image } from 'itk-wasm'

import { formatBytes } from '../format'
import { RESULT_NAME } from '../state'
import { exportImage } from './export'
import {
  canUseDeflateWorkers,
  exportScaleFactors,
  inPlaneScaleFactors,
  omeTiffPlaneCount,
  progressReporter,
  registrationOutputs,
  resultAddsAnatomicalOrientation,
  resultFilename,
  type ExportableState,
  type ProgressReporter as Reporter,
  type RegistrationOutputs,
} from './export-plan'
import type { ExportedFile, ExportProgressCallback } from './export-types'
import { imageFormatById, type ImageFormat } from './formats'
import { imageToIwiCborBytes } from './iwi-cbor'
import { INGEST_CHUNK_SIZE } from './load-image'
import { buildRfc5TransformSet, embedInMultiscales, TRANSFORM_OME_ZARR_VERSION } from './rfc5-transform'
import { asDeflatePool, tiffPoolSize } from './tiff-store'

export {
  EXPORT_LEVEL_CAP,
  registrationOutputs,
  resultFilename,
  type ExportableState,
  type RegistrationOutputs,
} from './export-plan'
export type { ExportProgress, ExportProgressCallback, ExportStage } from './export-types'

/**
 * Serialize the registration result in `state` as the image format
 * `formatId` names (a registry id, typically the picker's value) and return
 * the bytes with the file name they should be downloaded as. `onProgress`
 * receives the phases, with chunk or plane counts while an OME-Zarr or
 * OME-TIFF file is being written. Throws on an unknown format, on a state
 * without a result, and on anything the writer refuses, such as a volume
 * sent to a 2D-only format.
 */
export async function exportRegisteredImage(
  state: ExportableState,
  formatId: string,
  onProgress?: ExportProgressCallback,
): Promise<ExportedFile> {
  const format = imageFormatById(formatId)
  const outputs = registrationOutputs(state)
  const filename = resultFilename(format)
  const report = progressReporter(onProgress)

  let bytes: Uint8Array
  switch (format.kind) {
    case 'ozx':
      bytes = await writeOzx(outputs, report)
      break
    case 'ome-tiff':
      bytes = await writeOmeTiff(outputs, report)
      break
    case 'itk':
      bytes = await writeItk(outputs.result.image, format, filename, report)
      break
  }
  report('done', `Wrote ${filename} (${formatBytes(bytes.byteLength)})`)
  return { filename, bytes }
}

/**
 * The registered image as the base level of an OME-Zarr pyramid, on the
 * fixed image's grid. It is named after the result (`registered`) rather
 * than ngff-zarr's default `image`, and it borrows the fixed input's axis
 * units, which ITK-Wasm images do not carry and which describe this grid;
 * the anatomical orientation follows {@link resultAddsAnatomicalOrientation}.
 */
async function resultToNgffImage({ fixed, result }: RegistrationOutputs, report: Reporter): Promise<NgffImage> {
  report('convert', 'Converting the registered image to OME-Zarr…')
  const image = result.image
  const base = await itkImageToNgffImage(image, {
    addAnatomicalOrientation: resultAddsAnatomicalOrientation(fixed, image.imageType.dimension),
    chunks: INGEST_CHUNK_SIZE,
  })
  return new NgffImage({ ...base, name: RESULT_NAME, axesUnits: fixed.ngffImage.axesUnits })
}

/**
 * The pyramid for `base` with `scaleFactors`, built as ingest builds one:
 * Gaussian smoothing and uncompressed intermediate arrays, since the OZX
 * writer re-encodes every chunk with its own codecs and the OME-TIFF writer
 * deflates every tile, so compressing here would be wasted work. An empty
 * `scaleFactors` yields the single-level pyramid holding `base` itself.
 */
async function buildResultPyramid(
  base: NgffImage,
  scaleFactors: (number | Record<string, number>)[],
  report: Reporter,
): Promise<Multiscales> {
  report(
    'downsample',
    scaleFactors.length === 0
      ? 'Writing the registered image at full resolution only'
      : `Downsampling ${scaleFactors.length} level${scaleFactors.length === 1 ? '' : 's'}…`,
  )
  return toMultiscales(base, {
    scaleFactors,
    method: Methods.ITKWASM_GAUSSIAN,
    codecs: bytesOnlyCodecs(),
    chunks: INGEST_CHUNK_SIZE,
  })
}

/**
 * The `ozx` writer. The fixed-to-moving affine is attached to the pyramid's
 * multiscales metadata before the store is written, so ngff-zarr's 0.6
 * writer serializes the `intrinsic` and `moving` coordinate systems and the
 * transformation between them on the `multiscales[0]` entry. The writer
 * reads only the version-agnostic parts of the in-memory metadata (axes,
 * datasets, coordinate systems, transformations), so the `version` option
 * alone selects the 0.6 layout; nothing needs `createMetadataWithVersion`.
 */
async function writeOzx(outputs: RegistrationOutputs, report: Reporter): Promise<Uint8Array> {
  const { fixed, moving, result } = outputs
  const base = await resultToNgffImage(outputs, report)
  const multiscales = await buildResultPyramid(base, exportScaleFactors(base, fixed.budgetBytes), report)

  const transforms = buildRfc5TransformSet(result.transform, fixed, moving)
  embedInMultiscales(multiscales, transforms.embedded, transforms.movingSystem)

  report('package', 'Writing OME-Zarr…', { completed: 0, total: 0 })
  return toOmeZarrOzx(multiscales, {
    version: TRANSFORM_OME_ZARR_VERSION,
    onProgress: (completed, total) => {
      report('package', `Writing OME-Zarr chunk ${completed} of ${total}…`, { completed, total })
    },
  })
}

/**
 * The `ome-tiff` writer. The pyramid is the OZX one except that a volume is
 * downsampled in x and y only, which is the only pyramid an OME-TIFF can
 * hold (see {@link inPlaneScaleFactors}). Planes are read through
 * ngff-zarr's worker-backed `zarrGet`, wrapped to count them for progress
 * since fiff reports none itself. Tiles are deflated on a worker pool when
 * the page can use one ({@link canUseDeflateWorkers}) and on the main thread
 * otherwise; the pool's workers are terminated once the file is built.
 */
async function writeOmeTiff(outputs: RegistrationOutputs, report: Reporter): Promise<Uint8Array> {
  const { fixed } = outputs
  const base = await resultToNgffImage(outputs, report)
  const factors = exportScaleFactors(base, fixed.budgetBytes)
  const multiscales = await buildResultPyramid(
    base,
    base.dims.includes('z') ? inPlaneScaleFactors(factors, base.dims) : factors,
    report,
  )

  const total = omeTiffPlaneCount(multiscales)
  let completed = 0
  const getPlane: OmeTiffWriteOptions['getPlane'] = async (data, selection) => {
    const plane = await zarrGet(data, selection)
    completed += 1
    report('package', `Writing OME-TIFF plane ${completed} of ${total}…`, { completed, total })
    return plane
  }

  const pool = canUseDeflateWorkers() ? new WorkerPool(tiffPoolSize()) : undefined
  try {
    report('package', 'Writing OME-TIFF…', { completed, total })
    const buffer = await toOmeTiff(multiscales, {
      compression: 'deflate',
      pool: pool === undefined ? undefined : asDeflatePool(pool),
      getPlane,
    })
    return new Uint8Array(buffer)
  } finally {
    pool?.terminateWorkers()
  }
}

/**
 * The `itk` writer: `writeImage` in its own worker for every format but
 * `iwi.cbor`, whose ITK-Wasm writer mis-tags the byte order of multi-byte
 * pixels and which is therefore encoded here instead.
 */
async function writeItk(image: Image, format: ImageFormat, filename: string, report: Reporter): Promise<Uint8Array> {
  report('package', `Writing ${filename}…`)
  if (format.id === 'iwi.cbor') {
    return imageToIwiCborBytes(image)
  }
  const { bytes } = await exportImage(image, filename)
  return bytes
}
