// Generated file. To retain edits, remove this comment.

import { Image,BinaryFile } from 'itk-wasm'

interface ElastixOptions {
  /** Fixed image */
  fixed?: Image

  /** Moving image */
  moving?: Image

  /** Initial transform to apply before registrtion  */
  initialTransform?: string | File | BinaryFile

  /** Fixed-to-moving transform path */
  transformPath?: string

}

export default ElastixOptions
