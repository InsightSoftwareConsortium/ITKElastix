// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  Image,
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
 * @param {string} transform - Fixed-to-moving transform file
 * @param {ElastixNodeOptions} options - options object
 *
 * @returns {Promise<ElastixNodeResult>} - result object
 */
async function elastixNode(
  parameterObject: JsonCompatible,
  transform: string,
  options: ElastixNodeOptions = {}
) : Promise<ElastixNodeResult> {

  const mountDirs: Set<string> = new Set()

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
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
  mountDirs.add(path.dirname(transformName))

  const transformParameterObjectName = '1'
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
    mountDirs.add(path.dirname(initialTransform as string))
    args.push('--initial-transform')

    const name = initialTransform as string
    args.push(name)

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
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs, mountDirs)
  if (returnValue !== 0 && stderr !== "") {
    throw new Error(stderr)
  }

  const result = {
    result: outputs[0]?.data as Image,
    transformParameterObject: outputs[1]?.data as JsonCompatible,
  }
  return result
}

export default elastixNode
