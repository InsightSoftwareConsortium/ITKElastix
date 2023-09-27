// Generated file. To retain edits, remove this comment.

import { TextFile } from 'itk-wasm'

interface WriteParameterFilesResult {
  /** WebWorker used for computation */
  webWorker: Worker | null

  /** Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. */
  parameterFiles: TextFile[]

}

export default WriteParameterFilesResult
