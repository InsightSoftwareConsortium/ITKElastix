// The decisions behind `exportRegisteredImage` (src/io/export-image.ts) and
// `exportRegisteredTransform` (src/io/export-transform.ts), kept apart from
// them so the Node unit tests can exercise them: which parts of the app
// state an export needs, the file it is named, whether the registered
// image's anatomical orientation can be trusted, how far its pyramid
// extends, how the OME-TIFF writer's progress is counted, whether fiff's
// deflate workers can be used on this page, the elastix parameter JSON,
// and which transform format refuses the elastix list before a writer is
// even tried.
//
// Keep this module free of DOM access and of the ITK-Wasm, fiff, and
// ngff-zarr browser entry points; every import is a type or a pure helper.
import type { NgffImage } from '@fideus-labs/ngff-zarr'
import type { JsonCompatible, TransformList } from 'itk-wasm'

import type { RegistrationResult } from '../registration/types.ts'
import { RESULT_NAME, type AppState } from '../state.ts'
import type { ExportProgress, ExportProgressCallback, ExportStage } from './export-types.ts'
import { outputFilename, type ImageFormat, type TransformFormat } from './formats.ts'
import type { LoadedImage } from './load-image.ts'
import { planScaleFactors, SPATIAL_DIMS, type ImageShapeInfo } from './scale-select.ts'
import { hasOrientationExtension } from './source-kind.ts'
import { withoutCompositeHeader } from './transform-list.ts'

/** Most levels a registered image's pyramid is written with, the base included. */
export const EXPORT_LEVEL_CAP = 4

/** The parts of the state one registration export reads. */
export type ExportableState = Readonly<Pick<AppState, 'fixed' | 'moving' | 'result'>>

/** A registration result together with the two inputs it was computed from. */
export interface RegistrationOutputs {
  fixed: LoadedImage
  moving: LoadedImage
  result: RegistrationResult
}

/**
 * The result and both inputs from `state`, or a readable error when there
 * is nothing to export. `inputsLoaded` (src/state.ts) drops the result
 * whenever the inputs change, so a result without its inputs is a bug
 * rather than a state the UI can reach; the check is here so the exporters
 * never have to reason about it.
 */
export function registrationOutputs(state: ExportableState): RegistrationOutputs {
  const { fixed, moving, result } = state
  if (result === undefined) {
    throw new Error('There is no registration result to export yet; run a registration first')
  }
  if (fixed === undefined || moving === undefined) {
    throw new Error('The registration result has lost its input images, so its transform cannot be described')
  }
  return { fixed, moving, result }
}

/** File name the registered image is downloaded as in `format`. */
export function resultFilename(format: ImageFormat): string {
  return outputFilename(RESULT_NAME, format)
}

/** Stem the fixed-to-moving transform files are named with. */
export const TRANSFORM_STEM = 'transform'

/** Stem of the elastix TransformParameters JSON file. */
export const TRANSFORM_PARAMETERS_STEM = 'transform-parameters'

/**
 * File name the fixed-to-moving transform is downloaded as in `format`:
 * {@link TRANSFORM_STEM} plus the format's extension, except the elastix
 * parameter maps, which are named for what they hold since `transform.json`
 * would suggest a serialized transform rather than elastix's own
 * TransformParameters document.
 */
export function transformFilename(format: TransformFormat): string {
  return outputFilename(format.kind === 'json' ? TRANSFORM_PARAMETERS_STEM : TRANSFORM_STEM, format)
}

/**
 * The elastix transform parameter maps as UTF-8 JSON bytes, pretty-printed
 * with two spaces: the `transformParameterObject` elastix returned, one map
 * per optimized stage with its `TransformParameters`, in the layout
 * itk-wasm's elastix pipeline reads a parameter object back in from.
 */
export function elastixParametersJson(transformParameterObject: JsonCompatible): Uint8Array {
  const json = JSON.stringify(transformParameterObject, null, 2)
  if (json === undefined) {
    throw new Error('The registration result carries no elastix transform parameter maps')
  }
  return new TextEncoder().encode(json)
}

/**
 * Why `format` cannot hold `transform`, or `undefined` when its writer can
 * be tried. ITK's MINC XFM writer takes exactly one 3D linear transform
 * (elastix's leading `Composite` marker is ignored) and rejects anything
 * else with a bare wasm exception, so the translation → rigid → affine list
 * every run of this demo produces is refused up front with the reason.
 * Every other writer takes the multi-stage list as it is.
 */
export function unsupportedTransformFormatReason(
  format: TransformFormat,
  transform: TransformList,
): string | undefined {
  if (format.id !== 'xfm') {
    return undefined
  }
  const stages = withoutCompositeHeader(transform)
  const dimension = stages[0]?.transformType.inputDimension
  if (stages.length === 1 && dimension === 3) {
    return undefined
  }
  const produced =
    stages.length === 1
      ? `a ${dimension}D transform`
      : `${stages.length} stages${dimension === undefined ? '' : ` in ${dimension}D`}`
  return `MINC XFM holds a single 3D linear transform, but this registration produced ${produced}; choose another format`
}

/** The parts of the fixed input the orientation rule reads. */
export type OrientationSource = {
  name: string
  ngffImage: Pick<NgffImage, 'axesOrientations'>
}

/**
 * Whether `itkImageToNgffImage` should tag the registered image's axes with
 * RFC-4 anatomical orientations: the same rule ingest applies to the fixed
 * input, whose grid the registered image sits on.
 *
 * Ingest trusts orientation only for a 3D image (a 2D slice has no
 * anatomical frame to speak of) whose header stores a direction matrix,
 * which `multiscalesFromItkImage` decides from the file name
 * ({@link hasOrientationExtension}). An OME-Zarr or OME-TIFF source never
 * passes that name test, but it declares its orientation in its own
 * metadata, which the reader surfaces as `axesOrientations` and
 * `ngffImageToItkImage` folds into the direction matrix elastix worked in;
 * either signal means the result's direction is meaningful.
 */
export function resultAddsAnatomicalOrientation(fixed: OrientationSource, resultDimension: number): boolean {
  return resultDimension === 3 && (fixed.ngffImage.axesOrientations !== undefined || hasOrientationExtension(fixed.name))
}

/**
 * Isotropic scale factors for the registered image's pyramid: the same
 * budget-driven plan ingest uses ({@link planScaleFactors}), capped at
 * {@link EXPORT_LEVEL_CAP} levels.
 *
 * With the budget ingest used for the fixed image this is `[]` for every
 * registration result, because the result lives on the fixed image's
 * registration grid, which was chosen to fit that budget; the pyramid then
 * holds the full-resolution image alone. The cap only matters for a budget
 * smaller than the one the inputs were loaded under.
 */
export function exportScaleFactors(image: ImageShapeInfo, budgetBytes: number): number[] {
  return planScaleFactors(image, budgetBytes).slice(0, EXPORT_LEVEL_CAP - 1)
}

/**
 * `factors` as per-axis factors that shrink x and y only, for the OME-TIFF
 * pyramid of a volume. An OME-TIFF pyramid is XY-only: every z-plane has
 * its own IFD carrying its own sub-resolution IFDs, so fiff's writer reads
 * the full z extent from every level and a z-downsampled level comes back
 * with garbage planes. Non-spatial dims are left out; ngff-zarr treats a
 * missing axis as a factor of 1.
 */
export function inPlaneScaleFactors(factors: readonly number[], dims: readonly string[]): Record<string, number>[] {
  const spatial = dims.filter((dim) => SPATIAL_DIMS.includes(dim))
  return factors.map((factor) => Object.fromEntries(spatial.map((dim) => [dim, dim === 'z' ? 1 : factor])))
}

/**
 * Number of planes fiff's `toOmeTiff` reads from `multiscales`, so the
 * plane reader can report progress: one read per (t, c, z) of the base
 * level, repeated for every level, since a sub-resolution level inherits
 * the base level's non-spatial extents.
 */
export function omeTiffPlaneCount(multiscales: { readonly images: readonly ImageShapeInfo[] }): number {
  const [base] = multiscales.images
  if (base === undefined) {
    throw new Error('Cannot count the OME-TIFF planes of an empty multiscales pyramid')
  }
  const planesPerLevel = base.dims.reduce(
    (count, dim, index) => (dim === 'x' || dim === 'y' ? count : count * base.data.shape[index]),
    1,
  )
  return planesPerLevel * multiscales.images.length
}

/** What an ITK-Wasm writer was given, for the hint in {@link toWriterError}. */
export type WriterSubject = 'image' | 'transform'

const WRITER_HINTS: Record<WriterSubject, string> = {
  image: 'The format may not support this image’s pixel type or dimension; try another format.',
  transform: 'The format may not support this transform’s type, number of stages, or dimension; try another format.',
}

/**
 * Turn whatever an ITK-Wasm writer rejected with into an `Error` naming the
 * file. The writers report most problems through an `Error`, but an
 * uncaught C++ exception inside the wasm module (ITK's PNG writer refusing a
 * signed 16-bit slice, any 2D-only format given a volume, or the MINC XFM
 * writer given more than one transform) reaches JavaScript as Emscripten's
 * raw exception pointer, a bare number, which would otherwise be shown to
 * the user as is; `subject` picks the hint that follows the code. The
 * counterpart of `toRegistrationError` in src/registration/register.ts.
 */
export function toWriterError(error: unknown, filename: string, subject: WriterSubject = 'image'): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'number') {
    return new Error(
      `The ITK-Wasm writer for ${filename} stopped with an unhandled internal exception (code ${error}). ` +
        WRITER_HINTS[subject],
    )
  }
  return new Error(`Could not write ${filename}: ${String(error)}`)
}

/**
 * Progress reporter bound to one export: the stage and message of an
 * {@link ExportProgress}, with `extra` carrying the counts while a file is
 * being packaged.
 */
export type ProgressReporter = (stage: ExportStage, message: string, extra?: Partial<ExportProgress>) => void

/** A reporter forwarding to `onProgress`, or one that does nothing without it. */
export function progressReporter(onProgress?: ExportProgressCallback): ProgressReporter {
  return (stage, message, extra = {}) => {
    onProgress?.({ stage, message, ...extra })
  }
}

/**
 * Whether fiff's deflate worker pool can be used to compress OME-TIFF
 * tiles on this page. Its compress task tests `data.buffer instanceof
 * SharedArrayBuffer` without guarding the global, and a browser hides
 * `SharedArrayBuffer` unless the page is cross-origin isolated (COOP and
 * COEP headers, which the Vite dev server does not send), so the pool
 * throws a ReferenceError there. Without a pool fiff compresses on the main
 * thread with `CompressionStream`, which is still asynchronous.
 */
export function canUseDeflateWorkers(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}
