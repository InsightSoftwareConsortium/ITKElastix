// Generated file. To retain edits, remove this comment.

import { TextFile, WorkerPoolFunctionOption } from 'itk-wasm'

interface ReadParameterFilesOptions extends WorkerPoolFunctionOption {
  /** Elastix parameter files */
  parameterFiles: string[] | File[] | TextFile[]

}

export default ReadParameterFilesOptions
