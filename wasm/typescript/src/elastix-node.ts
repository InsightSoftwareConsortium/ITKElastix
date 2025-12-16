// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  Image,
  TransformList,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import ElastixNodeOptions from './elastix-node-options.js'
import ElastixNodeResult from './elastix-node-result.js'

import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Rigid and non-rigid registration of images.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation
 * @param {ElastixNodeOptions} options - options object
 *
 * @returns {Promise<ElastixNodeResult>} - result object
 */
async function elastixNode(
  parameterObject: JsonCompatible,
  options: ElastixNodeOptions = {}
) : Promise<ElastixNodeResult> {

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
    { type: InterfaceTypes.TransformList },
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

  const transformName = '1'
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
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.TransformList, data: options.initialTransform as TransformList })
    args.push('--initial-transform', inputCountString)

  }
  if (options.initialTransformParameterObject) {
    const inputCountString = inputs.length.toString()
    inputs.push({ type: InterfaceTypes.JsonCompatible, data: options.initialTransformParameterObject as JsonCompatible })
    args.push('--initial-transform-parameter-object', inputCountString)

  }

  const pipelinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipelines', 'elastix')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs)
  if (returnValue !== 0 && stderr !== "") {
    throw new Error(stderr)
  }

  const result = {
    result: outputs[0]?.data as Image,
    transform: outputs[1]?.data as TransformList,
    transformParameterObject: outputs[2]?.data as JsonCompatible,
  }
  return result
}

export default elastixNode
