// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import DefaultParameterMapNodeOptions from './default-parameter-map-node-options.js'
import DefaultParameterMapNodeResult from './default-parameter-map-node-result.js'

import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Returns the default elastix parameter map for a given transform type.
 *
 * @param {string} transformName - Transform name. One of: translation, rigid, affine, bspline, spline, groupwise
 * @param {DefaultParameterMapNodeOptions} options - options object
 *
 * @returns {Promise<DefaultParameterMapNodeResult>} - result object
 */
async function defaultParameterMapNode(
  transformName: string,
  options: DefaultParameterMapNodeOptions = {}
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
  if (options.numberOfResolutions) {
    args.push('--number-of-resolutions', options.numberOfResolutions.toString())

  }
  if (options.finalGridSpacing) {
    args.push('--final-grid-spacing', options.finalGridSpacing.toString())

  }

  const pipelinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipelines', 'default-parameter-map')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs)
  if (returnValue !== 0 && stderr !== "") {
    throw new Error(stderr)
  }

  const result = {
    parameterMap: outputs[0]?.data as JsonCompatible,
  }
  return result
}

export default defaultParameterMapNode
