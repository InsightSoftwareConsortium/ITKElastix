// Generated file. To retain edits, remove this comment.

import { Image,BinaryFile,JsonCompatible } from 'itk-wasm'

interface ElastixNodeOptions {
  /** Fixed image */
  fixed?: Image

  /** Moving image */
  moving?: Image

  /** Initial transform to apply before registration */
  initialTransform?: string | File | BinaryFile

  /** Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. */
  initialTransformParameterObject?: JsonCompatible

}

export default ElastixNodeOptions
