// Generated file. To retain edits, remove this comment.

import { JsonCompatible,TransformList, WorkerPoolFunctionOption } from 'itk-wasm'

interface TransformixOptions extends WorkerPoolFunctionOption {
  /** Elastix transform parameter object to apply. Provide this and/or an ITK transform. When both are provided, only its output image domain and resample interpolator are used. */
  transformParameterObject?: JsonCompatible

  /** ITK transform to apply. Provide this and/or a transform parameter object. The output image domain defaults to the moving image domain. */
  transform?: TransformList

  /** Output image origin. */
  outputOrigin?: number[]

  /** Output image spacing. */
  outputSpacing?: number[]

  /** Output image size. */
  outputSize?: number[]

  /** Output image orientation direction matrix. */
  outputDirection?: number[]

}

export default TransformixOptions
