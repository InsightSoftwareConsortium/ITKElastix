// Affine registration with elastix: the standard translation -> rigid ->
// affine stage sequence, each stage using its elastix default parameter map.
// Every pipeline call runs inside one itk-wasm web worker so the UI thread
// stays responsive; the worker is terminated when the run ends.
import { defaultParameterMap, elastix } from '@itk-wasm/elastix'
import { createWebWorker, type Image, type JsonCompatible } from 'itk-wasm'

import {
  AFFINE_STAGES,
  AFFINE_STAGES_LABEL,
  type AffineParameterOptions,
  type RegisterAffineOptions,
  type RegistrationResult,
  type RegistrationStage,
  type RegistrationStatusCallback,
} from './types'

export {
  AFFINE_STAGES,
  AFFINE_STAGES_LABEL,
  type AffineParameterOptions,
  type AffineStage,
  type RegisterAffineOptions,
  type RegisterFunction,
  type RegistrationResult,
  type RegistrationStage,
  type RegistrationStatus,
  type RegistrationStatusCallback,
} from './types'

export const DEFAULT_NUMBER_OF_RESOLUTIONS = 3

/**
 * Turn whatever a pipeline call rejected with into an `Error` with a
 * readable message. elastix reports most problems through stderr, which
 * `elastix()` already wraps in an Error, but an uncaught C++ exception
 * inside the wasm module (seen for a 2D fixed / 3D moving mismatch) reaches
 * JavaScript as Emscripten's raw exception pointer, a bare number.
 */
export function toRegistrationError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'number') {
    return new Error(
      `elastix stopped with an unhandled internal exception (code ${error}). ` +
        'Check that both images are scalar 2D or 3D images of the same dimension.',
    )
  }
  return new Error(String(error))
}

/**
 * Build the elastix parameter object for translation -> rigid -> affine:
 * one default parameter map per stage, in that order, from the
 * `default-parameter-map` pipeline.
 *
 * All three calls reuse `webWorker`. When none is given, the first call
 * creates one, the other two reuse it, and it is terminated before
 * returning.
 */
export async function buildAffineParameterObject(
  { numberOfResolutions = DEFAULT_NUMBER_OF_RESOLUTIONS }: AffineParameterOptions = {},
  webWorker: Worker | null = null,
): Promise<JsonCompatible[]> {
  const ownsWorker = webWorker === null
  let worker = webWorker
  try {
    const maps: JsonCompatible[] = []
    for (const stage of AFFINE_STAGES) {
      const { parameterMap, webWorker: usedWorker } = await defaultParameterMap(stage, {
        numberOfResolutions,
        webWorker: worker,
      })
      worker = usedWorker
      maps.push(parameterMap)
    }
    return maps
  } finally {
    if (ownsWorker) {
      worker?.terminate()
    }
  }
}

/**
 * Register `moving` onto `fixed` with elastix and return the resampled
 * moving image, the fixed-to-moving `TransformList` (a `Composite` marker
 * followed by the stage transforms), the optimized elastix transform
 * parameter maps, and the wall-clock time the run took.
 *
 * Both images must be scalar and of the same dimension (2D or 3D). itk-wasm
 * posts copies of their pixel buffers to the worker, so the inputs stay
 * usable afterwards.
 */
export async function registerAffine(
  fixed: Image,
  moving: Image,
  options: RegisterAffineOptions = {},
  onStatus?: RegistrationStatusCallback,
): Promise<RegistrationResult> {
  const startedAt = performance.now()
  const elapsed = () => performance.now() - startedAt
  const report = (stage: RegistrationStage, message: string) => {
    onStatus?.({ stage, message, elapsedMs: elapsed() })
  }

  const ownsWorker = options.webWorker === undefined
  const webWorker = options.webWorker ?? (await createWebWorker())
  try {
    report('parameters', `Building ${AFFINE_STAGES_LABEL} parameter maps…`)
    const parameterObject =
      options.parameterObject ??
      (await buildAffineParameterObject({ numberOfResolutions: options.numberOfResolutions }, webWorker))

    report('register', `Registering ${AFFINE_STAGES_LABEL}…`)
    const { result, transform, transformParameterObject } = await elastix(parameterObject, {
      fixed,
      moving,
      webWorker,
    }).catch((error: unknown) => {
      throw toRegistrationError(error)
    })
    // elastix() throws on a non-zero exit with stderr text; guard the silent
    // failure case where the outputs simply never arrived.
    if (result === undefined || transform === undefined) {
      throw new Error('elastix finished without producing a result image and transform')
    }
    const elapsedMs = elapsed()
    report('done', `Registered in ${(elapsedMs / 1000).toFixed(1)} s`)
    return { image: result, transform, transformParameterObject, elapsedMs }
  } finally {
    if (ownsWorker) {
      webWorker.terminate()
    }
  }
}
