import { setPipelineWorkerUrl } from './index.js'
// TypeScript might complain about implicit 'any' here
// @ts-ignore
import pipelineWorker from '../node_modules/itk-wasm/dist/pipeline/web-workers/bundles/itk-wasm-pipeline.min.worker.js'
setPipelineWorkerUrl(pipelineWorker)

export * from './index.js'
