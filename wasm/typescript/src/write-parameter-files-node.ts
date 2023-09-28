// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import WriteParameterFilesNodeResult from './write-parameter-files-node-result.js'


import path from 'path'

/**
 * Write an elastix parameter text file from a parameter object.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation.
 * @param {string[]} parameterFiles - Elastix parameter files, must have the same length as the number of parameter maps in the parameter object.
 *
 * @returns {Promise<WriteParameterFilesNodeResult>} - result object
 */
async function writeParameterFilesNode(
  parameterObject: JsonCompatible,
  parameterFiles: string[]

) : Promise<WriteParameterFilesNodeResult> {

  const mountDirs: Set<string> = new Set()

  const desiredOutputs: Array<PipelineOutput> = [
  ]

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Outputs
  parameterFiles.forEach((p) => args.push(p))
  parameterFiles.forEach((p) => mountDirs.add(path.dirname(p)))

  // Options
  args.push('--memory-io')

  const pipelinePath = path.join(path.dirname(import.meta.url.substring(7)), '..', 'pipelines', 'write-parameter-files')

  const {
    returnValue,
    stderr,
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs, mountDirs)
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
  }
  return result
}

export default writeParameterFilesNode
