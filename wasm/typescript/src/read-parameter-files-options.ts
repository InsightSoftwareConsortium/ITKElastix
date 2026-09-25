// Generated file. To retain edits, remove this comment.

import { TextFile, WorkerPoolFunctionOption } from 'itk-wasm'

interface ReadParameterFilesOptions extends WorkerPoolFunctionOption {
  /** Elastix parameter files. The file extension selects the format: .txt for the legacy text format, .toml for TOML. */
  parameterFiles: string[] | File[] | TextFile[]

}

export default ReadParameterFilesOptions
