// Generated file. To retain edits, remove this comment.

import { Image, BinaryFile, JsonCompatible } from 'itk-wasm'

interface ElastixResult {
  /** WebWorker used for computation */
  webWorker: Worker | null

  /** Resampled moving image */
  result: Image

  /** Fixed-to-moving transform file */
  transform: BinaryFile

  /** Elastix optimized transform parameter object representation */
  transformParameterObject: JsonCompatible

}

export default ElastixResult
