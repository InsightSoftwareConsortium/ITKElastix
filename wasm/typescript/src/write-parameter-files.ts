// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  TextFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import WriteParameterFilesOptions from './write-parameter-files-options.js'
import WriteParameterFilesResult from './write-parameter-files-result.js'

import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

import { getDefaultWebWorker } from './default-web-worker.js'

/**
 * Write an elastix parameter text file from a parameter object.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation.
 * @param {string[]} parameterFiles - Elastix parameter files, must have the same length as the number of parameter maps in the parameter object.
 * @param {WriteParameterFilesOptions} options - options object
 *
 * @returns {Promise<WriteParameterFilesResult>} - result object
 */
async function writeParameterFiles(
  parameterObject: JsonCompatible,
  parameterFiles: string[],
  options: WriteParameterFilesOptions = {}
) : Promise<WriteParameterFilesResult> {

  const parameterFilesPipelineOutputs = parameterFiles.map((p) => { return { type: InterfaceTypes.TextFile, data: { path: p, data: '' }}})
  const desiredOutputs: Array<PipelineOutput> = [
    ...parameterFilesPipelineOutputs,
  ]

  let outputIndex = 0
  const parameterFilesStart = outputIndex
  outputIndex += parameterFiles.length
  const parameterFilesEnd = outputIndex

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Outputs
  parameterFiles.forEach((p) => args.push(p))

  // Options
  args.push('--memory-io')

  const pipelinePath = 'write-parameter-files'

  let workerToUse = options?.webWorker
  if (workerToUse === undefined) {
    workerToUse = await getDefaultWebWorker()
  }
  const {
    webWorker: usedWebWorker,
    returnValue,
    stderr,
    outputs
  } = await runPipeline(pipelinePath, args, desiredOutputs, inputs, { pipelineBaseUrl: getPipelinesBaseUrl(), pipelineWorkerUrl: getPipelineWorkerUrl(), webWorker: workerToUse, noCopy: options?.noCopy })
  if (returnValue !== 0 && stderr !== "") {
    throw new Error(stderr)
  }

  const result = {
    webWorker: usedWebWorker as Worker,
    parameterFiles: outputs.slice(parameterFilesStart, parameterFilesEnd).map(o => (o?.data as TextFile)),
  }
  return result
}

export default writeParameterFiles
