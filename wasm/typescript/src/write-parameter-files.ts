// Generated file. To retain edits, remove this comment.

import {
  TextFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  JsonCompatible,
  runPipeline
} from 'itk-wasm'

import WriteParameterFilesOptions from './write-parameter-files-options.js'
import WriteParameterFilesResult from './write-parameter-files-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Write an elastix parameter text file from a parameter object.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation
 * @param {WriteParameterFilesOptions} options - options object
 *
 * @returns {Promise<WriteParameterFilesResult>} - result object
 */
async function writeParameterFiles(
  webWorker: null | Worker,
  parameterObject: JsonCompatible,
  options: WriteParameterFilesOptions = {}
) : Promise<WriteParameterFilesResult> {

  const parameterFilesPipelineOutputs = typeof options.parameterFilesPath !== 'undefined' ? options.parameterFilesPath.map((p) => { return { type: InterfaceTypes.TextFile, data: { path: p, data: '' }}}) : []
  const desiredOutputs: Array<PipelineOutput> = [
    ...parameterFilesPipelineOutputs,
  ]

  let outputIndex = 0
  const parameterFilesStart = outputIndex
  outputIndex += options.parameterFilesPath ? options.parameterFilesPath.length : 0
  const parameterFilesEnd = outputIndex

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName as string)

  // Outputs
  options.parameterFilesPath?.forEach((p) => args.push(p))

  // Options
  args.push('--memory-io')

  const pipelinePath = 'write-parameter-files'

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
    parameterFiles: outputs.slice(parameterFilesStart, parameterFilesEnd).map(o => (o.data as TextFile)),
  }
  return result
}

export default writeParameterFiles
