// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  Image,
  BinaryFile,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import ElastixOptions from './elastix-options.js'
import ElastixResult from './elastix-result.js'

import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

import { getDefaultWebWorker } from './default-web-worker.js'

/**
 * Rigid and non-rigid registration of images.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation
 * @param {string} transform - Fixed-to-moving transform file
 * @param {ElastixOptions} options - options object
 *
 * @returns {Promise<ElastixResult>} - result object
 */
async function elastix(
  parameterObject: JsonCompatible,
  transform: string,
  options: ElastixOptions = {}
) : Promise<ElastixResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
    { type: InterfaceTypes.BinaryFile, data: { path: transform, data: new Uint8Array() }},
    { type: InterfaceTypes.JsonCompatible },
  ]

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName)

  // Outputs
  const resultName = '0'
  args.push(resultName)

  const transformName = transform
  args.push(transformName)

  const transformParameterObjectName = '2'
  args.push(transformParameterObjectName)

  // Options
  args.push('--memory-io')
  if (options.fixed) {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.Image, data: options.fixed as Image })
    args.push('--fixed', inputCountString)

  }
  if (options.moving) {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.Image, data: options.moving as Image })
    args.push('--moving', inputCountString)

  }
  if (options.initialTransform) {
    const initialTransform = options.initialTransform
    let initialTransformFile = initialTransform
    if (initialTransform instanceof File) {
      const initialTransformBuffer = await initialTransform.arrayBuffer()
      initialTransformFile = { path: initialTransform.name, data: new Uint8Array(initialTransformBuffer) }
    }
    args.push('--initial-transform')

    inputs.push({ type: InterfaceTypes.BinaryFile, data: initialTransformFile as BinaryFile })
    const name = initialTransform instanceof File ? initialTransform.name : (initialTransform as BinaryFile).path
    args.push(name)

  }
  if (options.initialTransformParameterObject) {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.JsonCompatible, data: options.initialTransformParameterObject as JsonCompatible })
    args.push('--initial-transform-parameter-object', inputCountString)

  }

  const pipelinePath = 'elastix'

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
    transform: outputs[1]?.data as BinaryFile,
    transformParameterObject: outputs[2]?.data as JsonCompatible,
  }
  return result
}

export default elastix
