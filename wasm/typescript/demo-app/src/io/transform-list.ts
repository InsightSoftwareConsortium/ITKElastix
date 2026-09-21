// itk-wasm TransformList clean-up for the writers. Keep this module free of
// DOM access and pipeline imports so the node unit tests can exercise it.
import type { Transform, TransformList, TypedArray } from 'itk-wasm'

/**
 * When a pipeline returns a transform with zero parameters or zero fixed
 * parameters (elastix's `Translation` stage has no fixed parameters), itk-wasm
 * leaves the `data:application/vnd.itk.address,…` placeholder string in that
 * field instead of a typed array, and the transform writers then fail with
 * "Cannot read properties of undefined (reading 'byteLength')". Return a
 * copy of `transforms` in which every such field holds an empty typed array
 * of the transform's value type. `Composite` markers and fields whose count
 * is non-zero are left untouched.
 */
export function withTypedParameterArrays(transforms: TransformList): TransformList {
  return transforms.map((transform) => {
    if (transform.transformType.transformParameterization === 'Composite') {
      return transform
    }
    const parameters = typedOrEmpty(transform, transform.parameters, transform.numberOfParameters)
    const fixedParameters = typedOrEmpty(transform, transform.fixedParameters, transform.numberOfFixedParameters)
    if (parameters === transform.parameters && fixedParameters === transform.fixedParameters) {
      return transform
    }
    return { ...transform, parameters, fixedParameters }
  })
}

function typedOrEmpty(transform: Transform, value: TypedArray, count: number): TypedArray {
  if (count > 0 || ArrayBuffer.isView(value)) {
    return value
  }
  return transform.transformType.parametersValueType === 'float32' ? new Float32Array(0) : new Float64Array(0)
}
