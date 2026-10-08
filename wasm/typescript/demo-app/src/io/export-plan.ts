// The decisions behind `exportRegisteredImage` (src/io/export-image.ts) and
// `exportRegisteredTransform` (src/io/export-transform.ts), kept apart from
// them so the Node unit tests can exercise them: which parts of the app
// state an export needs, the file it is named, whether the registered
// image's anatomical orientation can be trusted, which axis metadata the
// OME-Zarr scene's images borrow from their inputs, how far a written
// pyramid extends, how the OME-TIFF writer's progress is counted, whether fiff's
// deflate workers can be used on this page, the elastix parameter JSON the
// copy button takes, the names and zip of the elastix TransformParameters
// TOML files, and the transform list each transform writer is given.
//
// Keep this module free of DOM access and of the ITK-Wasm, fiff, and
// ngff-zarr browser entry points; every import is a type or a pure helper.
import type { NgffImage } from '@fideus-labs/ngff-zarr'
import { zipSync } from 'fflate'
import type { JsonCompatible, TransformList } from 'itk-wasm'

import type { RegistrationResult } from '../registration/types.ts'
import { RESULT_NAME, type AppState } from '../state.ts'
import type { ExportProgress, ExportProgressCallback, ExportStage } from './export-types.ts'
import { outputFilename, type ImageFormat, type TransformFormat } from './formats.ts'
import type { LoadedImage } from './load-image.ts'
import { planScaleFactors, SPATIAL_DIMS, type ImageShapeInfo } from './scale-select.ts'
import { hasOrientationExtension } from './source-kind.ts'
import { composedAffineTransform } from './transform-list.ts'

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

/** Stem of the zip holding the elastix TransformParameters TOML files. */
export const TRANSFORM_PARAMETERS_STEM = 'transform-parameters'

/** Stem of the OME-Zarr scene holding the transform with the two images. */
export const SCENE_STEM = 'scene'

/**
 * File name the fixed-to-moving transform is downloaded as in `format`:
 * {@link TRANSFORM_STEM} plus the format's extension, except where the file
 * holds more than a serialized transform and is named for what it holds:
 * elastix's own TransformParameters files, since `transform.zip` would
 * suggest a serialized transform, and the OME-Zarr scene, whose extension
 * the transform-only OZX shares.
 */
export function transformFilename(format: TransformFormat): string {
  const stems: Partial<Record<TransformFormat['kind'], string>> = {
    toml: TRANSFORM_PARAMETERS_STEM,
    scene: SCENE_STEM,
  }
  return outputFilename(stems[format.kind] ?? TRANSFORM_STEM, format)
}

/**
 * Names of the elastix TransformParameters TOML files for `count` parameter
 * maps, `TransformParameters.<i>.toml` as elastix names its own output. The
 * `.toml` extension is what makes `writeParameterFiles` write TOML rather
 * than the legacy text format, and the names are what it chains the files
 * by: each file after the first gets the previous file's name as its
 * `InitialTransformParameterFileName`, so the last one read on its own by
 * transformix (from the directory the zip is extracted into) applies every
 * stage.
 */
export function elastixParameterFileNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `TransformParameters.${index}.toml`)
}

/** A text file written by an ITK-Wasm pipeline, as `writeParameterFiles` returns them. */
export interface NamedTextFile {
  path: string
  data: string
}

/**
 * `files` zipped into one archive, in their order, each stored under its
 * name at the archive root as UTF-8 and deflated.
 */
export function zipTextFiles(files: readonly NamedTextFile[]): Uint8Array {
  const encoder = new TextEncoder()
  return zipSync(Object.fromEntries(files.map(({ path, data }) => [path, encoder.encode(data)])))
}

/**
 * The elastix transform parameter maps as JSON text, pretty-printed with
 * two spaces: the `transformParameterObject` elastix returned, one map per
 * optimized stage with its `TransformParameters`, in the layout itk-wasm's
 * elastix pipeline reads a parameter object back in from. What the
 * registration summary's copy button puts on the clipboard.
 */
export function elastixParametersText(transformParameterObject: JsonCompatible): string {
  const json = JSON.stringify(transformParameterObject, null, 2)
  if (json === undefined) {
    throw new Error('The registration result carries no elastix transform parameter maps')
  }
  return json
}

/** Dimension of the one linear transform a MINC XFM file holds. */
export const XFM_DIMENSION = 3

/**
 * The transform list `format`'s ITK-Wasm writer is given for `transform`,
 * elastix's list. Every writer but MINC XFM's takes the multi-stage list as
 * it is. ITK's MINC XFM writer takes exactly one 3D linear transform and
 * rejects anything else with a bare wasm exception, so for it the stages
 * (translation, rigid, affine) are multiplied out into the single `Affine`
 * that maps every point where the list does, and a 2D registration's is
 * lifted into 3D with z passed through ({@link composedAffineTransform}).
 * Throws, naming the format, when a stage is not linear.
 */
export function transformForFormat(format: TransformFormat, transform: TransformList): TransformList {
  if (format.id !== 'xfm') {
    return transform
  }
  try {
    return [composedAffineTransform(transform, XFM_DIMENSION)]
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`MINC XFM holds a single 3D linear transform. ${reason}; choose another format`, { cause: error })
  }
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

/** The axis metadata an input lends to its image in the OME-Zarr scene. */
export type AxisMetadata = Pick<NgffImage, 'axesUnits' | 'axesOrientations'>

/** The entries of `record` for `dims`, in that order, or undefined when none is left. */
function pickDims<Value>(record: Record<string, Value> | undefined, dims: readonly string[]) {
  const entries = dims.flatMap((dim) => (record?.[dim] === undefined ? [] : [[dim, record[dim]] as const]))
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/**
 * The axis units and RFC-4 orientations `image` carries for `dims`, the axes
 * the registration ran in. An input's image in the OME-Zarr scene is the
 * scalar 2D or 3D image elastix registered, over `dims`, and borrows these
 * from the level it was cut from, since an ITK-Wasm image carries no units
 * and its direction matrix is what the orientations were folded into. A
 * source's 'c' or 't' axis, or a single-slice axis squeezed away, has no
 * entry; a record the level does not carry stays undefined. They are the
 * units and orientations the RFC-5 transform was built against
 * (src/io/rfc5-transform.ts), so the scene's images sit in the frames its
 * transform maps between.
 */
export function axisMetadataFor(image: AxisMetadata, dims: readonly string[]): AxisMetadata {
  return { axesUnits: pickDims(image.axesUnits, dims), axesOrientations: pickDims(image.axesOrientations, dims) }
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
 * signed 16-bit slice, or any 2D-only format given a volume) reaches
 * JavaScript as Emscripten's raw exception pointer, a bare number, which
 * would otherwise be shown to the user as is; `subject` picks the hint that
 * follows the code. The counterpart of `toRegistrationError` in
 * src/registration/register.ts.
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
