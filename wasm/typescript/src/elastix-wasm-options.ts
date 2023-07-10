import { Image } from 'itk-wasm'

interface ElastixWasmOptions {
  /** Fixed image */
  fixed?: Image

  /** Moving image */
  moving?: Image

}

export default ElastixWasmOptions
