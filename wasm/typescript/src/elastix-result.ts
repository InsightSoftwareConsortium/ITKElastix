// Generated file. To retain edits, remove this comment.

import { Image, BinaryFile, JsonCompatible, WorkerPoolFunctionResult } from 'itk-wasm'

interface ElastixResult extends WorkerPoolFunctionResult {
  /** Resampled moving image */
  result: Image

  /** Fixed-to-moving transform file */
  transform: BinaryFile

  /** Elastix optimized transform parameter object representation */
  transformParameterObject: JsonCompatible

}

export default ElastixResult
