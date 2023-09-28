// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  TextFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import ReadParameterFilesOptions from './read-parameter-files-options.js'
import ReadParameterFilesResult from './read-parameter-files-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Read elastix parameter text files into a parameter object.
 *
 * @param {ReadParameterFilesOptions} options - options object
 *
 * @returns {Promise<ReadParameterFilesResult>} - result object
 */
async function readParameterFiles(
  webWorker: null | Worker,
  options: ReadParameterFilesOptions = { parameterFiles: [] as TextFile[] | File[] | string[], }
) : Promise<ReadParameterFilesResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.JsonCompatible },
  ]

  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  // Outputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Options
  args.push('--memory-io')
  if (typeof options.parameterFiles !== "undefined") {
    if(options.parameterFiles.length < 1) {
      throw new Error('"parameter-files" option must have a length > 1')
    }
    args.push('--parameter-files')

    await Promise.all(options.parameterFiles.map(async (value) => {
      let valueFile = value
      if (value instanceof File) {
        const valueBuffer = await value.arrayBuffer()
        valueFile = { path: value.name, data: new TextDecoder().decode(valueBuffer) }
      }
      inputs.push({ type: InterfaceTypes.TextFile, data: valueFile as TextFile })
      const name = value instanceof File ? value.name : (valueFile as TextFile).path
      args.push(name)
    }))
  }

  const pipelinePath = 'read-parameter-files'

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

export default readParameterFiles
