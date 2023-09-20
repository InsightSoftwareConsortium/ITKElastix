// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  TextFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import ReadParameterFileOptions from './read-parameter-file-options.js'
import ReadParameterFileResult from './read-parameter-file-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Read an elastix parameter text file into a parameter object.
 *
 * @param {ReadParameterFileOptions} options - options object
 *
 * @returns {Promise<ReadParameterFileResult>} - result object
 */
async function readParameterFile(
  webWorker: null | Worker,
  options: ReadParameterFileOptions = { parameterFiles: [] as TextFile[] | File[] | string[], }
) : Promise<ReadParameterFileResult> {

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
