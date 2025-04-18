// Generated file. To retain edits, remove this comment.

import {
  JsonCompatible,
  InterfaceTypes,
  PipelineOutput,
  PipelineInput,
  runPipeline
} from 'itk-wasm'

import DefaultParameterMapOptions from './default-parameter-map-options.js'
import DefaultParameterMapResult from './default-parameter-map-result.js'

import { getPipelinesBaseUrl } from './pipelines-base-url.js'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

import { getDefaultWebWorker } from './default-web-worker.js'

/**
 * Returns the default elastix parameter map for a given transform type.
 *
 * @param {string} transformName - Transform name. One of: translation, rigid, affine, bspline, spline, groupwise
 * @param {DefaultParameterMapOptions} options - options object
 *
 * @returns {Promise<DefaultParameterMapResult>} - result object
 */
async function defaultParameterMap(
  transformName: string,
  options: DefaultParameterMapOptions = {}
) : Promise<DefaultParameterMapResult> {

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

  const pipelinePath = 'default-parameter-map'

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
    parameterMap: outputs[0]?.data as JsonCompatible,
  }
  return result
}

export default defaultParameterMap
