// Generated file. To retain edits, remove this comment.

import { getDefaultWebWorker as itkWasmGetDefaultWebWorker, createWebWorker, ItkWorker } from 'itk-wasm'
import { getPipelineWorkerUrl } from './pipeline-worker-url.js'

let defaultWebWorker: Worker | null = null

async function createNewWorker() {
  const pipelineWorkerUrl = getPipelineWorkerUrl()
  const pipelineWorkerUrlString = typeof pipelineWorkerUrl !== 'string' && typeof pipelineWorkerUrl?.href !== 'undefined' ? pipelineWorkerUrl.href : pipelineWorkerUrl
  defaultWebWorker = await createWebWorker(pipelineWorkerUrlString as string | null)
}

export function setDefaultWebWorker (webWorker: Worker | null): void {
  defaultWebWorker = webWorker
}

export async function getDefaultWebWorker (): Promise<Worker> {
  if (defaultWebWorker !== null) {
    if ((defaultWebWorker as ItkWorker).terminated) {
      await createNewWorker()
    }
    return defaultWebWorker
  }
  const itkWasmDefaultWebWorker = itkWasmGetDefaultWebWorker()
  if (itkWasmDefaultWebWorker !== null) {
    return itkWasmDefaultWebWorker
  }

  await createNewWorker()
  return defaultWebWorker as unknown as Worker
}
