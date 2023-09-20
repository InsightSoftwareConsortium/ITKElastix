// Generated file. To retain edits, remove this comment.

import {
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

/**
 * Rigid and non-rigid registration of images.
 *
 * @param {ElastixOptions} options - options object
 *
 * @returns {Promise<ElastixResult>} - result object
 */
async function elastix(
  webWorker: null | Worker,
  options: ElastixOptions = {}
) : Promise<ElastixResult> {

  const transformPath = typeof options.transformPath === 'undefined' ? 'transform' : options.transformPath
  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
    { type: InterfaceTypes.BinaryFile, data: { path: transformPath, data: new Uint8Array() }},
  ]

  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  // Outputs
  const resultName = '0'
  args.push(resultName)

  const transformName = transformPath
  args.push(transformName)

  // Options
  args.push('--memory-io')
  if (typeof options.fixed !== "undefined") {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.Image, data: options.fixed as Image })
    args.push('--fixed', inputCountString)

  }
  if (typeof options.moving !== "undefined") {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.Image, data: options.moving as Image })
    args.push('--moving', inputCountString)

  }

  const pipelinePath = 'elastix'

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
    result: outputs[0].data as Image,
    transform: outputs[1].data as BinaryFile,
  }
  return result
}

export default elastix
