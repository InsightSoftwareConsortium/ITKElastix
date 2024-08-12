// Generated file. To retain edits, remove this comment.

import { TextFile, WorkerPoolFunctionResult } from 'itk-wasm'

interface WriteParameterFilesResult extends WorkerPoolFunctionResult {
  /** Elastix parameter files, must have the same length as the number of parameter maps in the parameter object. */
  parameterFiles: TextFile[]

}

export default WriteParameterFilesResult
