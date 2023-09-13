// Generated file. To retain edits, remove this comment.

import * as elastix from '../../../dist/bundles/elastix.js'

// Use local, vendored WebAssembly module assets
const pipelinesBaseUrl: string | URL = new URL('/pipelines', document.location.origin).href
elastix.setPipelinesBaseUrl(pipelinesBaseUrl)
const pipelineWorkerUrl: string | URL | null = new URL('/web-workers/pipeline.worker.js', document.location.origin).href
elastix.setPipelineWorkerUrl(pipelineWorkerUrl)

import './elastix-controller.js'

const tabGroup = document.querySelector('sl-tab-group')
const params = new URLSearchParams(window.location.search)
if (params.has('functionName')) {
  const functionName = params.get('functionName')
  tabGroup.show(functionName + '-panel')
} else {
  tabGroup.show('elastix-panel')
}
