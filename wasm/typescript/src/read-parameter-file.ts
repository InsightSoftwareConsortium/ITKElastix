// Generated file. To retain edits, remove this comment.

import {
  TextFile,
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import ReadParameterFileResult from './read-parameter-file-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Read an elastix parameter text file into a parameter object.
 *
 * @param {File | TextFile} parameterFile - Elastix parameter file
 *
 * @returns {Promise<ReadParameterFileResult>} - result object
 */
async function readParameterFile(
  webWorker: null | Worker,
  parameterFile: File | TextFile

) : Promise<ReadParameterFileResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.JsonCompatible },
  ]

  let parameterFileFile = parameterFile
  if (parameterFile instanceof File) {
    const parameterFileBuffer = await parameterFile.arrayBuffer()
    parameterFileFile = { path: parameterFile.name, data: new TextDecoder().decode(parameterFileBuffer) }
  }
  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.TextFile, data: parameterFileFile as TextFile },
  ]

  const args = []
  // Inputs
  const parameterFileName = (parameterFileFile as TextFile).path
  args.push(parameterFileName as string)

  // Outputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Options
  args.push('--memory-io')

  const pipelinePath = 'read-parameter-file'

  const {
    webWorker: usedWebWorker,
    returnValue,
    stderr,
    outputs
  } = await runPipeline(webWorker, pipelinePath, args, desiredOutputs, inputs, { pipelineBaseUrl: getPipelinesBaseUrl(), pipelineWorkerUrl: getPipelineWorkerUrl() })
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
    webWorker: usedWebWorker as Worker,
    parameterObject: outputs[0].data as JsonCompatible,
  }
  return result
}

export default readParameterFile
