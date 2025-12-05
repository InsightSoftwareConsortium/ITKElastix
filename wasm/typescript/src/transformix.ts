// Generated file. To retain edits, remove this comment.

import {
  Image,
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import TransformixOptions from './transformix-options.js'
import TransformixResult from './transformix-result.js'

import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

import { getDefaultWebWorker } from './default-web-worker.js'

/**
 * Apply an elastix transform parameter object to an image.
 *
 * @param {Image} moving - Moving image
 * @param {JsonCompatible} transformParameterObject - Elastix transform parameter object to apply. Only provide this or an initial transform.
 * @param {TransformixOptions} options - options object
 *
 * @returns {Promise<TransformixResult>} - result object
 */
async function transformix(
  moving: Image,
  transformParameterObject: JsonCompatible,
  options: TransformixOptions = {}
) : Promise<TransformixResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
  ]

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.Image, data: moving },
    { type: InterfaceTypes.JsonCompatible, data: transformParameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const movingName = '0'
  args.push(movingName)

  const transformParameterObjectName = '1'
  args.push(transformParameterObjectName)

  // Outputs
  const resultName = '0'
  args.push(resultName)

  // Options
  args.push('--memory-io')
  if (options.outputOrigin) {
    if(options.outputOrigin.length < 1) {
      throw new Error('"output-origin" option must have a length > 1')
    }
    args.push('--output-origin')

    await Promise.all(options.outputOrigin.map(async (value) => {
      args.push(value.toString())
    }))
  }
  if (options.outputSpacing) {
    if(options.outputSpacing.length < 1) {
      throw new Error('"output-spacing" option must have a length > 1')
    }
    args.push('--output-spacing')

    await Promise.all(options.outputSpacing.map(async (value) => {
      args.push(value.toString())
    }))
  }
  if (options.outputSize) {
    if(options.outputSize.length < 1) {
      throw new Error('"output-size" option must have a length > 1')
    }
    args.push('--output-size')

    await Promise.all(options.outputSize.map(async (value) => {
      args.push(value.toString())
    }))
  }
  if (options.outputDirection) {
    if(options.outputDirection.length < 1) {
      throw new Error('"output-direction" option must have a length > 1')
    }
    args.push('--output-direction')

    await Promise.all(options.outputDirection.map(async (value) => {
      args.push(value.toString())
    }))
  }

  const pipelinePath = 'transformix'

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
    result: outputs[0]?.data as Image,
  }
  return result
}

export default transformix
