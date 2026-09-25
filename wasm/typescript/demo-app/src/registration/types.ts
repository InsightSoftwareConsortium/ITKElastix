// Types and constants shared by the elastix runner (src/registration/
// register.ts) and the modules that only read state or drive the UI, such as
// src/state.ts, src/ui/register-flow.ts, and the node unit tests. Nothing
// here imports the elastix pipeline (and its web worker), so those modules
// stay free of it.
import type { Image, JsonCompatible, TransformList } from 'itk-wasm'

/** Elastix transform stages, in the order they are optimized. */
export const AFFINE_STAGES = ['translation', 'rigid', 'affine'] as const

export type AffineStage = (typeof AFFINE_STAGES)[number]

/** Label for the stage sequence, as shown in the status row. */
export const AFFINE_STAGES_LABEL = 'translation → rigid → affine'

/** Multi-resolution pyramid levels each stage is optimized over unless the run says otherwise. */
export const DEFAULT_NUMBER_OF_RESOLUTIONS = 3

export interface RegistrationResult {
  /** The moving image resampled onto the fixed image's grid. */
  image: Image
  /**
   * Fixed-to-moving ITK transform as itk-wasm's `TransformList`: a
   * `Composite` marker followed by one transform per elastix stage.
   */
  transform: TransformList
  /** Elastix transform parameter maps for the optimized stages. */
  transformParameterObject: JsonCompatible
  /** Wall-clock duration of the elastix pipeline, in milliseconds. */
  elapsedMs: number
  /**
   * Pyramid levels each stage was optimized over, when the run built the
   * default parameter maps; absent for a caller-supplied parameter object.
   */
  numberOfResolutions?: number
}

/**
 * Coarse phases of one run. Elastix reports nothing while it optimizes, so
 * the stages inside `'register'` cannot be told apart from outside.
 */
export type RegistrationStage = 'parameters' | 'register' | 'done'

export interface RegistrationStatus {
  stage: RegistrationStage
  message: string
  /** Milliseconds since the run started. */
  elapsedMs: number
}

export type RegistrationStatusCallback = (status: RegistrationStatus) => void

export interface AffineParameterOptions {
  /** Multi-resolution pyramid levels per stage (elastix `NumberOfResolutions`). */
  numberOfResolutions?: number
}

export interface RegisterAffineOptions extends AffineParameterOptions {
  /**
   * Parameter object to run instead of the default translation -> rigid ->
   * affine maps, e.g. one loaded from parameter files.
   */
  parameterObject?: JsonCompatible
  /**
   * itk-wasm web worker to run the pipelines in. When omitted one is created
   * for the run and terminated afterwards; a caller-supplied worker is left
   * running unless the run is aborted.
   */
  webWorker?: Worker
  /**
   * Aborting it cancels the run: the pending pipeline call is abandoned,
   * the worker is terminated (a caller-supplied one too, since terminating
   * it is the only way to stop elastix), and the run rejects with the
   * signal's reason.
   */
  signal?: AbortSignal
}

/** Signature of {@link registerAffine}, for injecting a stand-in. */
export type RegisterFunction = (
  fixed: Image,
  moving: Image,
  options?: RegisterAffineOptions,
  onStatus?: RegistrationStatusCallback,
) => Promise<RegistrationResult>
