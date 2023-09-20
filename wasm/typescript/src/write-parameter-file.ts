// Generated file. To retain edits, remove this comment.

import {
  TextFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  JsonCompatible,
  runPipeline
} from 'itk-wasm'

import WriteParameterFileOptions from './write-parameter-file-options.js'
import WriteParameterFileResult from './write-parameter-file-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Write an elastix parameter text file from a parameter object.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation
 * @param {WriteParameterFileOptions} options - options object
 *
 * @returns {Promise<WriteParameterFileResult>} - result object
 */
async function writeParameterFile(
  webWorker: null | Worker,
  parameterObject: JsonCompatible,
  options: WriteParameterFileOptions = {}
) : Promise<WriteParameterFileResult> {

  const parameterFilesPath = typeof options.parameterFilesPath === 'undefined' ? 'parameterFiles' : options.parameterFilesPath
  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.TextFile, data: { path: parameterFilesPath, data: '' }},
  ]

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName as string)

  // Outputs
  const parameterFilesName = parameterFilesPath
  args.push(parameterFilesName)

  // Options
  args.push('--memory-io')

  const pipelinePath = 'write-parameter-file'

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
    parameterFiles: outputs[0].data as TextFile,
  }
  return result
}

export default writeParameterFile
