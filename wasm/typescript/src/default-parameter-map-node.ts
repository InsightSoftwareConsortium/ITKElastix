// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import DefaultParameterMapOptions from './default-parameter-map-options.js'
import DefaultParameterMapNodeResult from './default-parameter-map-node-result.js'


import path from 'path'

/**
 * Returns the default elastix parameter map for a given transform type.
 *
 * @param {string} transformName - Transform name. One of: translation, rigid, affine, bspline, spline, groupwise
 * @param {DefaultParameterMapOptions} options - options object
 *
 * @returns {Promise<DefaultParameterMapNodeResult>} - result object
 */
async function defaultParameterMapNode(
  transformName: string,
  options: DefaultParameterMapOptions = {}
) : Promise<DefaultParameterMapNodeResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.JsonCompatible },
  ]

  const inputs: Array<PipelineInput> = [
  ]

  const args = []
  // Inputs
  args.push(transformName.toString())

  // Outputs
  const parameterMapName = '0'
  args.push(parameterMapName)

  // Options
  args.push('--memory-io')
  if (typeof options.numberOfResolutions !== "undefined") {
    args.push('--number-of-resolutions', options.numberOfResolutions.toString())

  }
  if (typeof options.finalGridSpacing !== "undefined") {
    args.push('--final-grid-spacing', options.finalGridSpacing.toString())

  }

  const pipelinePath = path.join(path.dirname(import.meta.url.substring(7)), '..', 'pipelines', 'default-parameter-map')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs)
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
    parameterMap: outputs[0].data as JsonCompatible,
  }
  return result
}

export default defaultParameterMapNode
