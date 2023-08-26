// Generated file. To retain edits, remove this comment.

import {
  Image,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import ElastixWasmOptions from './elastix-wasm-options.js'
import ElastixWasmNodeResult from './elastix-wasm-node-result.js'


import path from 'path'

/**
 * Rigid and non-rigid registration of images.
 *
 * @param {ElastixWasmOptions} options - options object
 *
 * @returns {Promise<ElastixWasmNodeResult>} - result object
 */
async function elastixWasmNode(
  options: ElastixWasmOptions = {}
) : Promise<ElastixWasmNodeResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
  ]

  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  // Outputs
  const resultName = '0'
  args.push(resultName)

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

  const pipelinePath = path.join(path.dirname(import.meta.url.substring(7)), '..', 'pipelines', 'elastix-wasm')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs)
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
    result: outputs[0].data as Image,
  }
  return result
}

export default elastixWasmNode
