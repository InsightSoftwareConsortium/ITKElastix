// Generated file. To retain edits, remove this comment.

import { Image, TransformList, JsonCompatible } from 'itk-wasm'

interface ElastixNodeResult {
  /** Resampled moving image */
  result: Image

  /** Fixed-to-moving transform file */
  transform: TransformList

  /** Elastix optimized transform parameter object representation */
  transformParameterObject: JsonCompatible

}

export default ElastixNodeResult
