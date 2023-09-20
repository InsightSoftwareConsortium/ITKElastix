// Generated file. To retain edits, remove this comment.

import { Image, BinaryFile } from 'itk-wasm'

interface ElastixResult {
  /** WebWorker used for computation */
  webWorker: Worker | null

  /** Resampled moving image */
  result: Image

  /** Fixed-to-moving transform */
  transform: BinaryFile

}

export default ElastixResult
