import { getPipelineWorkerUrl as itkWasmGetPipelineWorkerUrl } from 'itk-wasm'

let pipelineWorkerUrl: string | URL | null | undefined
// Use the version shipped with an app's bundler
const defaultPipelineWorkerUrl = null

export function setPipelineWorkerUrl (workerUrl: string | URL | null): void {
  pipelineWorkerUrl = workerUrl
}

export function getPipelineWorkerUrl (): string | URL | null {
  if (typeof pipelineWorkerUrl !== 'undefined') {
    return pipelineWorkerUrl
  }
  const itkWasmPipelineWorkerUrl = itkWasmGetPipelineWorkerUrl()
  if (typeof itkWasmPipelineWorkerUrl !== 'undefined') {
    return itkWasmPipelineWorkerUrl
  }
  return defaultPipelineWorkerUrl
}
