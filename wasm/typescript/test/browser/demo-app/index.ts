import * as elastix from '../../../dist/bundles/elastix.js'

// Use local, vendored WebAssembly module assets
const pipelinesBaseUrl: string | URL = new URL('/pipelines', document.location.origin).href
elastix.setPipelinesBaseUrl(pipelinesBaseUrl)
const pipelineWorkerUrl: string | URL | null = new URL('/web-workers/pipeline.worker.js', document.location.origin).href
elastix.setPipelineWorkerUrl(pipelineWorkerUrl)

import './default-parameter-map-controller.js'
import './elastix-controller.js'
import './read-parameter-files-controller.js'
import './write-parameter-files-controller.js'

const params = new URLSearchParams(window.location.search)
if (!params.has('functionName')) {
  params.set('functionName', 'elastix')
  const url = new URL(document.location)
  url.search = params
  window.history.replaceState({ functionName: 'elastix' }, '', url)
}
