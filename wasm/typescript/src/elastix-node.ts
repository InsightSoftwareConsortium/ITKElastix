// Generated file. To retain edits, remove this comment.

import {
  Image,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  JsonCompatible,
  runPipelineNode
} from 'itk-wasm'

import ElastixOptions from './elastix-options.js'
import ElastixNodeResult from './elastix-node-result.js'


import path from 'path'

/**
 * Rigid and non-rigid registration of images.
 *
 * @param {JsonCompatible} parameterObject - Elastix parameter object representation
 * @param {ElastixOptions} options - options object
 *
 * @returns {Promise<ElastixNodeResult>} - result object
 */
async function elastixNode(
  parameterObject: JsonCompatible,
  options: ElastixOptions = {}
) : Promise<ElastixNodeResult> {

  const mountDirs: Set<string> = new Set()

  const desiredOutputs: Array<PipelineOutput> = [
    { type: InterfaceTypes.Image },
  ]

  const inputs: Array<PipelineInput> = [
    { type: InterfaceTypes.JsonCompatible, data: parameterObject as JsonCompatible  },
  ]

  const args = []
  // Inputs
  const parameterObjectName = '0'
  args.push(parameterObjectName as string)

  // Outputs
  const resultName = '0'
  args.push(resultName)

  const transformName = options.transformPath ?? 'transform'
  args.push(transformName)
  mountDirs.add(path.dirname(transformName))

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
  if (typeof options.initialTransform !== "undefined") {
    const initialTransform = options.initialTransform
    mountDirs.add(path.dirname(value as string))
    args.push('--initial-transform')

    const name = initialTransform as string
    args.push(name)

  }

  const pipelinePath = path.join(path.dirname(import.meta.url.substring(7)), '..', 'pipelines', 'elastix')

  const {
    returnValue,
    stderr,
    outputs
  } = await runPipelineNode(pipelinePath, args, desiredOutputs, inputs, mountDirs)
  if (returnValue !== 0) {
    throw new Error(stderr)
  }

  const result = {
    result: outputs[0].data as Image,
  }
  return result
}

export default elastixNode
