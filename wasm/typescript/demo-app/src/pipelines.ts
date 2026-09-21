// Point every ITK-Wasm package at the pipeline assets that viteStaticCopy
// vendors under `<base>/pipelines/` (see vite.config.ts) so the demo never
// reaches out to a CDN for its WebAssembly modules.
//
// main.ts must import this module before any other itk-wasm work.
import { setPipelinesBaseUrl as setElastixPipelinesBaseUrl } from '@itk-wasm/elastix'
import { setPipelinesBaseUrl as setImageIoPipelinesBaseUrl } from '@itk-wasm/image-io'
import { setPipelinesBaseUrl as setTransformIoPipelinesBaseUrl } from '@itk-wasm/transform-io'
import { setPipelinesBaseUrl as setDownsamplePipelinesBaseUrl } from '@itk-wasm/downsample'

export const pipelinesBaseUrl = new URL(
  `${import.meta.env.BASE_URL}pipelines`,
  document.location.origin,
).href

setElastixPipelinesBaseUrl(pipelinesBaseUrl)
setImageIoPipelinesBaseUrl(pipelinesBaseUrl)
setTransformIoPipelinesBaseUrl(pipelinesBaseUrl)
setDownsamplePipelinesBaseUrl(pipelinesBaseUrl)
