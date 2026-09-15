// Generated file. To retain edits, remove this comment.

import { Image,TransformList,JsonCompatible, WorkerPoolFunctionOption } from 'itk-wasm'

interface ElastixOptions extends WorkerPoolFunctionOption {
  /** Fixed image */
  fixed?: Image

  /** Moving image */
  moving?: Image

  /** Initial transform to apply before registration */
  initialTransform?: TransformList

  /** Initial elastix transform parameter object to apply before registration. Only provide this or an initial transform. */
  initialTransformParameterObject?: JsonCompatible

}

export default ElastixOptions
