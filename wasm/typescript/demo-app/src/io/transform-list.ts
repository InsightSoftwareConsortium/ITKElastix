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

type TransformParameterization = Transform['transformType']['transformParameterization']

/** Parameterizations {@link toAffineTransform} rewrites: ITK classes whose linear part is stored as angles or a versor. */
export const ANGLE_OR_VERSOR_PARAMETERIZATIONS: ReadonlySet<TransformParameterization> = new Set<TransformParameterization>([
  'Euler2D',
  'Rigid2D',
  'Similarity2D',
  'Euler3D',
  'VersorRigid3D',
  'Similarity3D',
])

type Matrix = number[][]

function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0]!.map((_, column) => row.reduce((sum, value, k) => sum + value * b[k]![column]!, 0)))
}

function scaled(matrix: Matrix, scale: number): Matrix {
  return matrix.map((row) => row.map((value) => value * scale))
}

/** ITK `Rigid2DTransform::ComputeMatrix`: a counter-clockwise rotation by `angle` radians. */
function rotation2d(angle: number): Matrix {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [
    [c, -s],
    [s, c],
  ]
}

/**
 * ITK `Euler3DTransform::ComputeMatrix`: the product of the three axis
 * rotations, `Rz * Ry * Rx` when the transform computes ZYX and ITK's
 * default `Rz * Rx * Ry` otherwise.
 */
function euler3dMatrix(angleX: number, angleY: number, angleZ: number, computeZYX: boolean): Matrix {
  const [cx, sx] = [Math.cos(angleX), Math.sin(angleX)]
  const [cy, sy] = [Math.cos(angleY), Math.sin(angleY)]
  const [cz, sz] = [Math.cos(angleZ), Math.sin(angleZ)]
  const rotationX: Matrix = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ]
  const rotationY: Matrix = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ]
  const rotationZ: Matrix = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ]
  return computeZYX
    ? multiply(multiply(rotationZ, rotationY), rotationX)
    : multiply(multiply(rotationZ, rotationX), rotationY)
}

/**
 * ITK `Versor::GetMatrix` for the vector part `(x, y, z)` of a unit
 * quaternion, whose scalar part ITK recovers as the non-negative root.
 */
function versorMatrix(x: number, y: number, z: number): Matrix {
  const w = Math.sqrt(Math.max(0, 1 - (x * x + y * y + z * z)))
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ]
}

/** The values of a parameter field, which must hold a typed array by now. */
function numbers(transform: Transform, field: 'parameters' | 'fixedParameters', atLeast: number): number[] {
  const value = transform[field]
  if (!ArrayBuffer.isView(value)) {
    throw new Error(
      `The ${transform.transformType.transformParameterization} transform's ${field} is not a typed array; ` +
        'pass the list through withTypedParameterArrays first',
    )
  }
  const values = Array.from(value as ArrayLike<number>)
  if (values.length < atLeast) {
    throw new Error(
      `An ITK ${transform.transformType.transformParameterization} transform needs at least ${atLeast} ${field}, ` +
        `got ${values.length}`,
    )
  }
  return values
}

/** The linear part, translation, and center of rotation an ITK transform stores. */
interface MatrixOffset {
  matrix: Matrix
  translation: number[]
  center: number[]
}

/**
 * Decode the parameterizations in {@link ANGLE_OR_VERSOR_PARAMETERIZATIONS}
 * following ITK's `SetParameters` / `SetFixedParameters` layouts; the
 * center of rotation is the leading entries of the fixed parameters in
 * every one of them. Returns undefined for any other parameterization.
 */
function decodeMatrixOffset(transform: Transform): MatrixOffset | undefined {
  switch (transform.transformType.transformParameterization) {
    case 'Euler2D':
    case 'Rigid2D': {
      // [angle, tx, ty]; fixed: [cx, cy]
      const p = numbers(transform, 'parameters', 3)
      return { matrix: rotation2d(p[0]!), translation: p.slice(1, 3), center: numbers(transform, 'fixedParameters', 2).slice(0, 2) }
    }
    case 'Similarity2D': {
      // [scale, angle, tx, ty]; fixed: [cx, cy]
      const p = numbers(transform, 'parameters', 4)
      return {
        matrix: scaled(rotation2d(p[1]!), p[0]!),
        translation: p.slice(2, 4),
        center: numbers(transform, 'fixedParameters', 2).slice(0, 2),
      }
    }
    case 'Euler3D': {
      // [ax, ay, az, tx, ty, tz]; fixed: [cx, cy, cz] plus, since ITK 5, the ComputeZYX flag
      const p = numbers(transform, 'parameters', 6)
      const f = numbers(transform, 'fixedParameters', 3)
      return { matrix: euler3dMatrix(p[0]!, p[1]!, p[2]!, (f[3] ?? 0) !== 0), translation: p.slice(3, 6), center: f.slice(0, 3) }
    }
    case 'VersorRigid3D': {
      // [vx, vy, vz, tx, ty, tz]; fixed: [cx, cy, cz]
      const p = numbers(transform, 'parameters', 6)
      return { matrix: versorMatrix(p[0]!, p[1]!, p[2]!), translation: p.slice(3, 6), center: numbers(transform, 'fixedParameters', 3).slice(0, 3) }
    }
    case 'Similarity3D': {
      // [vx, vy, vz, tx, ty, tz, scale]; fixed: [cx, cy, cz]
      const p = numbers(transform, 'parameters', 7)
      return {
        matrix: scaled(versorMatrix(p[0]!, p[1]!, p[2]!), p[6]!),
        translation: p.slice(3, 6),
        center: numbers(transform, 'fixedParameters', 3).slice(0, 3),
      }
    }
    default:
      return undefined
  }
}

/**
 * `transform` as the equivalent ITK `Affine` transform when it is one of
 * {@link ANGLE_OR_VERSOR_PARAMETERIZATIONS}, else `transform` itself.
 *
 * elastix's rigid and similarity stages come back as `Euler2D`,
 * `Euler3D`, `Similarity2D`, or `Similarity3D`, which store their linear
 * part as angles or a versor. ITK's own writers understand them, but
 * ngff-zarr's `itkTransformToNgffTransform` only decodes parameterizations
 * that store a matrix and asks for exactly this conversion. The matrix is
 * computed the way the ITK class computes it, and the translation and
 * center of rotation are carried over unchanged, so the affine maps every
 * point where the original did: `y = M (x - c) + c + t` in both.
 */
export function toAffineTransform(transform: Transform): Transform {
  const decoded = decodeMatrixOffset(transform)
  if (decoded === undefined) {
    return transform
  }
  const dimension = transform.transformType.inputDimension
  const Values = transform.transformType.parametersValueType === 'float32' ? Float32Array : Float64Array
  const affine: TransformParameterization = 'Affine'
  return {
    ...transform,
    transformType: { ...transform.transformType, transformParameterization: affine },
    numberOfParameters: dimension * dimension + dimension,
    numberOfFixedParameters: dimension,
    parameters: new Values([...decoded.matrix.flat(), ...decoded.translation]),
    fixedParameters: new Values(decoded.center),
  }
}

/** `transforms` with every angle- or versor-parameterized entry rewritten by {@link toAffineTransform}. */
export function withAffineStages(transforms: TransformList): TransformList {
  return transforms.map(toAffineTransform)
}

/**
 * `transforms` without the leading `Composite` marker. An itk-wasm pipeline
 * serializes a composite transform as a parameterless `Composite` entry
 * followed by its components, and elastix always returns one (see
 * `wasm/elastix-wasm.cxx`). The ITK writers understand that convention, but
 * ngff-zarr's `itkTransformToNgffTransform` refuses a `Composite` entry
 * wherever it appears, because a *nested* composite serializes as the same
 * parameterless entry with its children dropped, and it cannot tell the two
 * apart. Dropping the header is what its error message asks for; a
 * `Composite` further down the list is left in place so it still throws.
 */
export function withoutCompositeHeader(transforms: TransformList): TransformList {
  return transforms[0]?.transformType.transformParameterization === 'Composite' ? transforms.slice(1) : transforms
}
