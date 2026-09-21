// The decisions behind `exportRegisteredImage` (src/io/export-image.ts),
// kept apart from it so the Node unit tests can exercise them: which parts
// of the app state an export needs, the file it is named, whether the
// registered image's anatomical orientation can be trusted, how far its
// pyramid extends, how the OME-TIFF writer's progress is counted, and
// whether fiff's deflate workers can be used on this page.
//
// Keep this module free of DOM access and of the ITK-Wasm, fiff, and
// ngff-zarr browser entry points; every import is a type or a pure helper.
import type { NgffImage } from '@fideus-labs/ngff-zarr'

import type { RegistrationResult } from '../registration/types.ts'
import { RESULT_NAME, type AppState } from '../state.ts'
import { outputFilename, type ImageFormat } from './formats.ts'
import type { LoadedImage } from './load-image.ts'
import { planScaleFactors, SPATIAL_DIMS, type ImageShapeInfo } from './scale-select.ts'
import { hasOrientationExtension } from './source-kind.ts'

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

/**
 * Turn whatever an ITK-Wasm writer rejected with into an `Error` naming the
 * file. The writers report most problems through an `Error`, but an
 * uncaught C++ exception inside the wasm module (ITK's PNG writer refusing a
 * signed 16-bit slice, or any 2D-only format given a volume) reaches
 * JavaScript as Emscripten's raw exception pointer, a bare number, which
 * would otherwise be shown to the user as is. The counterpart of
 * `toRegistrationError` in src/registration/register.ts.
 */
export function toWriterError(error: unknown, filename: string): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'number') {
    return new Error(
      `The ITK-Wasm writer for ${filename} stopped with an unhandled internal exception (code ${error}). ` +
        'The format may not support this image’s pixel type or dimension; try another format.',
    )
  }
  return new Error(`Could not write ${filename}: ${String(error)}`)
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
