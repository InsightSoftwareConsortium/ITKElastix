// Unit tests for the TransformList clean-up. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Transform, TransformList } from 'itk-wasm'
import {
  ANGLE_OR_VERSOR_PARAMETERIZATIONS,
  toAffineTransform,
  withAffineStages,
  withoutCompositeHeader,
  withTypedParameterArrays,
} from './transform-list.ts'

const PLACEHOLDER = 'data:application/vnd.itk.address,0:0'

function transform(
  parameterization: string,
  fields: Partial<Record<'parameters' | 'fixedParameters', unknown>> & { n: number; fixedN: number; valueType?: string },
): Transform {
  return {
    transformType: {
      transformParameterization: parameterization,
      parametersValueType: fields.valueType ?? 'float64',
      inputDimension: 2,
      outputDimension: 2,
    },
    numberOfParameters: fields.n,
    numberOfFixedParameters: fields.fixedN,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: fields.parameters ?? new Float64Array(fields.n),
    fixedParameters: fields.fixedParameters ?? new Float64Array(fields.fixedN),
  } as unknown as Transform
}

test('replaces the placeholder string of a zero-count field with an empty typed array', () => {
  const translation = transform('Translation', { n: 2, fixedN: 0, parameters: new Float64Array([1, 2]), fixedParameters: PLACEHOLDER })
  const [cleaned] = withTypedParameterArrays([translation])

  assert.ok(cleaned!.fixedParameters instanceof Float64Array)
  assert.equal(cleaned!.fixedParameters.length, 0)
  assert.equal(cleaned!.parameters, translation.parameters, 'the typed array is kept as is')
  assert.equal(cleaned!.numberOfParameters, 2)
  assert.equal((translation.fixedParameters as unknown) as string, PLACEHOLDER, 'the input is not mutated')
})

test('uses Float32Array for float32 transforms', () => {
  const [cleaned] = withTypedParameterArrays([
    transform('Translation', { n: 0, fixedN: 0, valueType: 'float32', parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER }),
  ])
  assert.ok(cleaned!.parameters instanceof Float32Array)
  assert.ok(cleaned!.fixedParameters instanceof Float32Array)
})

test('returns the same objects for Composite markers and already typed transforms', () => {
  const composite = transform('Composite', { n: 0, fixedN: 0, parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER })
  const affine = transform('Affine', { n: 6, fixedN: 2 })
  const list: TransformList = [composite, affine]

  const cleaned = withTypedParameterArrays(list)

  assert.equal(cleaned[0], composite)
  assert.equal(cleaned[1], affine)
  assert.equal(cleaned.length, 2)
})

test('leaves a non-typed field alone when its count is non-zero, so the writer reports it', () => {
  const broken = transform('Affine', { n: 6, fixedN: 2, fixedParameters: PLACEHOLDER })
  const [cleaned] = withTypedParameterArrays([broken])
  assert.equal(cleaned, broken)
})

test('withoutCompositeHeader drops the leading Composite marker elastix writes', () => {
  const composite = transform('Composite', { n: 0, fixedN: 0, parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER })
  const translation = transform('Translation', { n: 2, fixedN: 0 })
  const affine = transform('Affine', { n: 6, fixedN: 2 })

  assert.deepEqual(withoutCompositeHeader([composite, translation, affine]), [translation, affine])
})

test('withoutCompositeHeader leaves a list without a header, and a nested Composite, untouched', () => {
  const affine = transform('Affine', { n: 6, fixedN: 2 })
  const nested = transform('Composite', { n: 0, fixedN: 0, parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER })
  const list: TransformList = [affine, nested]

  assert.equal(withoutCompositeHeader(list), list)
  assert.deepEqual(withoutCompositeHeader([]), [])
})

/** `actual` is a transform's parameter field, whose itk-wasm type admits BigInt arrays too. */
function assertClose(actual: ArrayLike<number | bigint>, expected: number[], message: string): void {
  assert.equal(actual.length, expected.length, `${message}: length`)
  for (let i = 0; i < expected.length; i++) {
    const value = Number(actual[i])
    assert.ok(Math.abs(value - expected[i]!) < 1e-12, `${message}: [${i}] is ${value}, expected ${expected[i]}`)
  }
}

/** A transform whose parameter fields hold the given values. */
function stage(parameterization: string, dimension: number, parameters: number[], fixedParameters: number[], valueType = 'float64'): Transform {
  const Values = valueType === 'float32' ? Float32Array : Float64Array
  return {
    ...transform(parameterization, { n: parameters.length, fixedN: fixedParameters.length, valueType }),
    transformType: { transformParameterization: parameterization, parametersValueType: valueType, inputDimension: dimension, outputDimension: dimension },
    parameters: new Values(parameters),
    fixedParameters: new Values(fixedParameters),
  } as unknown as Transform
}

test('toAffineTransform turns an Euler2D stage into the affine with the same rotation, translation, and center', () => {
  // A quarter turn: cos = 0, sin = 1 up to rounding.
  const affine = toAffineTransform(stage('Euler2D', 2, [Math.PI / 2, 3, -4], [10, 20]))

  assert.equal(affine.transformType.transformParameterization, 'Affine')
  assert.equal(affine.transformType.inputDimension, 2)
  assert.equal(affine.numberOfParameters, 6)
  assert.equal(affine.numberOfFixedParameters, 2)
  assertClose(affine.parameters, [0, -1, 1, 0, 3, -4], 'parameters')
  assertClose(affine.fixedParameters, [10, 20], 'fixed parameters')
  assert.ok(affine.parameters instanceof Float64Array)
})

test('toAffineTransform reads Rigid2D like Euler2D and scales a Similarity2D rotation', () => {
  const rigid = toAffineTransform(stage('Rigid2D', 2, [Math.PI, 1, 2], [0, 0]))
  assertClose(rigid.parameters, [-1, 0, 0, -1, 1, 2], 'Rigid2D')

  // Similarity2D stores [scale, angle, tx, ty].
  const similarity = toAffineTransform(stage('Similarity2D', 2, [2, Math.PI / 2, 5, 6], [7, 8]))
  assertClose(similarity.parameters, [0, -2, 2, 0, 5, 6], 'Similarity2D parameters')
  assertClose(similarity.fixedParameters, [7, 8], 'Similarity2D center')
})

test('toAffineTransform composes Euler3D rotations in ITK order: Rz Rx Ry by default, Rz Ry Rx with ComputeZYX', () => {
  const quarter = Math.PI / 2
  // Rx alone, in either order.
  assertClose(
    toAffineTransform(stage('Euler3D', 3, [quarter, 0, 0, 1, 2, 3], [4, 5, 6])).parameters,
    [1, 0, 0, 0, 0, -1, 0, 1, 0, 1, 2, 3],
    'Rx',
  )
  // Rx then Ry differ by order: default is Rz * Rx * Ry, so a point first turns about y, then about x.
  const rxy = [0, 0, 1, 1, 0, 0, 0, 1, 0]
  const ryx = [0, 1, 0, 0, 0, -1, -1, 0, 0]
  assertClose(
    toAffineTransform(stage('Euler3D', 3, [quarter, quarter, 0, 0, 0, 0], [0, 0, 0])).parameters,
    [...rxy, 0, 0, 0],
    'Rx * Ry (default)',
  )
  assertClose(
    toAffineTransform(stage('Euler3D', 3, [quarter, quarter, 0, 0, 0, 0], [0, 0, 0, 1])).parameters,
    [...ryx, 0, 0, 0],
    'Ry * Rx (ComputeZYX)',
  )
  // The ComputeZYX flag is not a center coordinate.
  const withFlag = toAffineTransform(stage('Euler3D', 3, [0, 0, 0, 0, 0, 0], [4, 5, 6, 1]))
  assertClose(withFlag.fixedParameters, [4, 5, 6], 'center without the flag')
  assert.equal(withFlag.numberOfFixedParameters, 3)
})

test('toAffineTransform builds the matrix of a versor for VersorRigid3D and Similarity3D', () => {
  // A quarter turn about z is the versor (0, 0, sin 45°) with scalar cos 45°.
  const half = Math.SQRT1_2
  const rz = [0, -1, 0, 1, 0, 0, 0, 0, 1]
  assertClose(toAffineTransform(stage('VersorRigid3D', 3, [0, 0, half, 1, 2, 3], [4, 5, 6])).parameters, [...rz, 1, 2, 3], 'VersorRigid3D')
  // Similarity3D stores [vx, vy, vz, tx, ty, tz, scale].
  assertClose(
    toAffineTransform(stage('Similarity3D', 3, [0, 0, half, 1, 2, 3, 3], [4, 5, 6])).parameters,
    [...rz.map((value) => value * 3), 1, 2, 3],
    'Similarity3D',
  )
})

test('toAffineTransform keeps float32 value types and leaves other parameterizations untouched', () => {
  const affine32 = toAffineTransform(stage('Euler2D', 2, [0, 1, 2], [3, 4], 'float32'))
  assert.ok(affine32.parameters instanceof Float32Array)
  assert.equal(affine32.transformType.parametersValueType, 'float32')

  for (const parameterization of ['Affine', 'Translation', 'Composite', 'BSpline', 'Identity']) {
    const original = transform(parameterization, { n: 0, fixedN: 0, parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER })
    assert.equal(toAffineTransform(original), original, parameterization)
    assert.equal(ANGLE_OR_VERSOR_PARAMETERIZATIONS.has(parameterization as never), false, parameterization)
  }
})

test('toAffineTransform reports a placeholder string or a short parameter list readably', () => {
  const placeholder = transform('Euler2D', { n: 3, fixedN: 2, parameters: PLACEHOLDER })
  assert.throws(() => toAffineTransform(placeholder), /withTypedParameterArrays/)
  assert.throws(() => toAffineTransform(stage('Euler3D', 3, [0, 0, 0], [0, 0, 0])), /at least 6 parameters/)
  assert.throws(() => toAffineTransform(stage('Euler2D', 2, [0, 1, 2], [0])), /at least 2 fixedParameters/)
})

test('withAffineStages rewrites only the angle and versor stages of a list', () => {
  const composite = transform('Composite', { n: 0, fixedN: 0, parameters: PLACEHOLDER, fixedParameters: PLACEHOLDER })
  const affine = stage('Affine', 2, [1, 0, 0, 1, 0, 0], [0, 0])
  const euler = stage('Euler2D', 2, [0, 1, 2], [3, 4])
  const translation = stage('Translation', 2, [5, 6], [])

  const rewritten = withAffineStages([composite, affine, euler, translation])

  assert.equal(rewritten[0], composite)
  assert.equal(rewritten[1], affine)
  assert.equal(rewritten[2]!.transformType.transformParameterization, 'Affine')
  assertClose(rewritten[2]!.parameters, [1, 0, 0, 1, 1, 2], 'rewritten Euler2D')
  assert.equal(rewritten[3], translation)
})
