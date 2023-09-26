// Generated file. To retain edits, remove this comment.

import { Image,BinaryFile,JsonCompatible } from 'itk-wasm'

interface ElastixOptions {
  /** Fixed image */
  fixed?: Image

  /** Moving image */
  moving?: Image

  /** Initial transform to apply before registration */
  initialTransform?: string | File | BinaryFile

  /** Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. */
  initialTransformParameterObject?: JsonCompatible

  /** Fixed-to-moving transform path */
  transformPath?: string

}

export default ElastixOptions
