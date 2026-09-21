// Shape of one elastix run's output. Defined here, apart from the runner in
// src/registration/register.ts, so src/state.ts can type its `result` slot
// without pulling the elastix pipeline (and its worker) into modules that
// only read state, such as the node unit tests.
import type { Image, JsonCompatible, TransformList } from 'itk-wasm'

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
}
