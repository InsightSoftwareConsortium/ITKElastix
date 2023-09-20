// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import ReadParameterFileNodeResult from './read-parameter-file-node-result.js'


import path from 'path'

/**
 * Read an elastix parameter text file into a parameter object.
 *
 * @param {string} parameterFile - Elastix parameter file
 *
 * @returns {Promise<ReadParameterFileNodeResult>} - result object
 */
async function readParameterFileNode(
  parameterFile: string

) : Promise<ReadParameterFileNodeResult> {

  const mountDirs: Set<string> = new Set()

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.JsonCompatible },
  ]

  mountDirs.add(path.dirname(parameterFile as string))
  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  const parameterFileName = parameterFile
  args.push(parameterFileName as string)

  // Outputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Options
  args.push('--memory-io')

  const pipelinePath = path.join(path.dirname(import.meta.url.substring(7)), '..', 'pipelines', 'read-parameter-file')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs, mountDirs)
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
    parameterObject: outputs[0].data as JsonCompatible,
  }
  return result
}

export default readParameterFileNode
