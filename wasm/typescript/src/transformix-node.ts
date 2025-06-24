// Generated file. To retain edits, remove this comment.

import {
  Image,
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipelineNode
} from 'itk-wasm'

import TransformixNodeOptions from './transformix-node-options.js'
import TransformixNodeResult from './transformix-node-result.js'

import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Apply an elastix transform parameter object to an image.
 *
 * @param {Image} moving - Moving image
 * @param {JsonCompatible} transformParameterObject - Elastix transform parameter object to apply. Only provide this or an initial transform.
 * @param {TransformixNodeOptions} options - options object
 *
 * @returns {Promise<TransformixNodeResult>} - result object
 */
async function transformixNode(
  moving: Image,
  transformParameterObject: JsonCompatible,
  options: TransformixNodeOptions = {}
) : Promise<TransformixNodeResult> {

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

    options.outputOrigin.forEach((value) => {
      args.push(value.toString())
    })
  }
  if (options.outputSpacing) {
    if(options.outputSpacing.length < 1) {
      throw new Error('"output-spacing" option must have a length > 1')
    }
    args.push('--output-spacing')

    options.outputSpacing.forEach((value) => {
      args.push(value.toString())
    })
  }
  if (options.outputSize) {
    if(options.outputSize.length < 1) {
      throw new Error('"output-size" option must have a length > 1')
    }
    args.push('--output-size')

    options.outputSize.forEach((value) => {
      args.push(value.toString())
    })
  }
  if (options.outputDirection) {
    if(options.outputDirection.length < 1) {
      throw new Error('"output-direction" option must have a length > 1')
    }
    args.push('--output-direction')

    options.outputDirection.forEach((value) => {
      args.push(value.toString())
    })
  }

  const pipelinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipelines', 'transformix')

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
  }
  return result
}

export default transformixNode
