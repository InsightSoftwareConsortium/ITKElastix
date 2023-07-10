import { Image } from 'itk-wasm'

interface ElastixWasmResult {
  /** WebWorker used for computation */
  webWorker: Worker | null

  /** The result image */
  result: Image

}

export default ElastixWasmResult
