// Generated file. Do not edit.

import {
  Image,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import ElastixWasmOptions from './elastix-wasm-options.js'
import ElastixWasmResult from './elastix-wasm-result.js'


import { getPipelinesBaseUrl } from './pipelines-base-url.js'


import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

/**
 * Rigid and non-rigid registration of images.
 *
 *
 * @returns {Promise<ElastixWasmResult>} - result object
 */
async function elastixWasm(
  webWorker: null | Worker,
  options: ElastixWasmOptions = {}
) : Promise<ElastixWasmResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
  ]
  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  // Outputs
  args.push('0')
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

  const pipelinePath = 'elastix-wasm'

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
  }
  return result
}

export default elastixWasm
