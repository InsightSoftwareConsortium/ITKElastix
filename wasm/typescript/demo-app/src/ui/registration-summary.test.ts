// Unit tests for the registration summary content. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNgffImage, NgffImage } from '@fideus-labs/ngff-zarr'
import type { Transform, TransformList } from 'itk-wasm'

import type { TransformFrame } from '../io/rfc5-transform.ts'
import { AFFINE_STAGES_LABEL, type RegistrationResult } from '../registration/types.ts'
import { formatMatrixValue, summarizeRegistration, summaryBrief, summaryFields } from './registration-summary.ts'

const PLACEHOLDER = 'data:application/vnd.itk.address,0:0'

/** The `Composite` marker elastix puts in front of its stage transforms. */
const COMPOSITE_HEADER = {
  transformType: {
    transformParameterization: 'Composite',
    parametersValueType: 'float64',
    inputDimension: 2,
    outputDimension: 2,
  },
  numberOfParameters: 0,
  numberOfFixedParameters: 0,
  name: '',
  inputSpaceName: '',
  outputSpaceName: '',
  parameters: PLACEHOLDER,
  fixedParameters: PLACEHOLDER,
} as unknown as Transform

/** An ITK-Wasm `Affine` entry, row-major in ITK's x, y order with the center of rotation as fixed parameters. */
function itkAffine(matrix: number[][], translation: number[], center: number[] = []): Transform {
  const dimension = translation.length
  return {
    transformType: {
      transformParameterization: 'Affine',
      parametersValueType: 'float64',
      inputDimension: dimension,
      outputDimension: dimension,
    },
    numberOfParameters: dimension * dimension + dimension,
    numberOfFixedParameters: center.length,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array([...matrix.flat(), ...translation]),
    fixedParameters: new Float64Array(center),
  } as unknown as Transform
}

/** An ITK-Wasm `Euler2D` entry: `[angle, tx, ty]` with the center as fixed parameters. */
function itkEuler2D(angle: number, translation: number[], center: number[]): Transform {
  return {
    transformType: {
      transformParameterization: 'Euler2D',
      parametersValueType: 'float64',
      inputDimension: 2,
      outputDimension: 2,
    },
    numberOfParameters: 3,
    numberOfFixedParameters: 2,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array([angle, ...translation]),
    fixedParameters: new Float64Array(center),
  } as unknown as Transform
}

/** An ITK-Wasm `Translation` entry as elastix returns it: no fixed parameters, so the placeholder string. */
function itkTranslation(translation: number[]): Transform {
  return {
    transformType: {
      transformParameterization: 'Translation',
      parametersValueType: 'float64',
      inputDimension: translation.length,
      outputDimension: translation.length,
    },
    numberOfParameters: translation.length,
    numberOfFixedParameters: 0,
    name: '',
    inputSpaceName: '',
    outputSpaceName: '',
    parameters: new Float64Array(translation),
    fixedParameters: PLACEHOLDER,
  } as unknown as Transform
}

/** A 2D frame on the unit grid with no orientation, so ITK space and the intrinsic system coincide. */
async function frame2d(): Promise<TransformFrame> {
  const dims = ['y', 'x']
  const base = await createNgffImage([], [4, 4], 'float32', dims, { y: 1, x: 1 }, { y: 0, x: 0 })
  return { dimension: 2, ngffImage: new NgffImage({ ...base, computedCallbacks: undefined }) }
}

function fakeResult(transform: TransformList, overrides: Partial<RegistrationResult> = {}): RegistrationResult {
  return {
    image: { name: 'result' },
    transform,
    transformParameterObject: [{ Transform: ['AffineTransform'], TransformParameters: ['1', '0', '0', '1', '3', '-4'] }],
    elapsedMs: 1234,
    numberOfResolutions: 3,
    ...overrides,
  } as unknown as RegistrationResult
}

test('summarizeRegistration converts the list to a matrix and offset in OME-Zarr axis order', async () => {
  // ITK: y = A (p - c) + t + c with A row-major in x, y order; the center
  // folds into the offset (b = t + c - A c = [-7, 6] in x, y) and the axes
  // are permuted to y, x. Same fixture as the RFC-5 transform tests.
  const matrix = [
    [1.5, 0.25],
    [-0.5, 0.75],
  ]
  const result = fakeResult([COMPOSITE_HEADER, itkAffine(matrix, [3, -4], [10, 20])])
  const fixed = await frame2d()
  const moving = await frame2d()

  const summary = summarizeRegistration(result, fixed, moving)

  assert.equal(summary.stages, AFFINE_STAGES_LABEL)
  assert.equal(summary.resolutions, 3)
  assert.equal(summary.elapsed, '1.2 s')
  assert.deepEqual(summary.dims, ['y', 'x'])
  assert.deepEqual(summary.matrix, [
    [0.75, -0.5],
    [0.25, 1.5],
  ])
  assert.deepEqual(summary.offset, [6, -7])
  assert.equal(summary.parametersText, JSON.stringify(result.transformParameterObject, null, 2))
})

test('summarizeRegistration takes elastix’s three-stage list as it comes back', async () => {
  // The Composite header, a Translation with the placeholder string for its
  // zero fixed parameters, and an Euler2D storing an angle are all handled
  // on the way in; a quarter turn about the origin plus a translation.
  const result = fakeResult(
    [COMPOSITE_HEADER, itkAffine([[1, 0], [0, 1]], [0, 0]), itkEuler2D(Math.PI / 2, [0, 0], [0, 0]), itkTranslation([1, 2])],
    { numberOfResolutions: undefined },
  )
  const fixed = await frame2d()
  const moving = await frame2d()

  const summary = summarizeRegistration(result, fixed, moving)

  assert.equal(summary.resolutions, undefined)
  assert.equal(summary.matrix.length, 2)
  assert.equal(summary.offset.length, 2)
  for (const row of summary.matrix) {
    assert.equal(row.length, 2)
    for (const value of row) {
      assert.ok(Number.isFinite(value))
    }
  }
  // A rotation's entries are ±1 and 0 up to floating point.
  const rounded = summary.matrix.map((row) => row.map((value) => Math.round(value)))
  assert.deepEqual(rounded.flat().map(Math.abs).sort(), [0, 0, 1, 1])
})

test('formatMatrixValue rounds to four decimals without trailing zeros and no negative zero', () => {
  assert.equal(formatMatrixValue(1), '1')
  assert.equal(formatMatrixValue(0.999999), '1')
  assert.equal(formatMatrixValue(-0.5), '-0.5')
  assert.equal(formatMatrixValue(0.123456), '0.1235')
  assert.equal(formatMatrixValue(-1e-9), '0')
  assert.equal(formatMatrixValue(-0), '0')
  assert.equal(formatMatrixValue(12345.678), '12345.678')
  assert.equal(formatMatrixValue(-7.00004), '-7')
  assert.equal(formatMatrixValue(Number.NaN), 'NaN')
  assert.equal(formatMatrixValue(Number.POSITIVE_INFINITY), 'Infinity')
})

test('summaryFields lists the stages, the resolutions when known, the elapsed time, and the axes', () => {
  const summary = {
    stages: AFFINE_STAGES_LABEL,
    resolutions: 4,
    elapsed: '2.5 s',
    dims: ['z', 'y', 'x'],
    matrix: [],
    offset: [],
    parametersText: '[]',
  }
  assert.deepEqual(summaryFields(summary), [
    { key: 'stages', label: 'Stages', value: AFFINE_STAGES_LABEL },
    { key: 'resolutions', label: 'Resolutions per stage', value: '4' },
    { key: 'elapsed', label: 'Registered in', value: '2.5 s' },
    { key: 'axes', label: 'Axes (OME-Zarr order)', value: 'z, y, x' },
  ])
  assert.deepEqual(
    summaryFields({ ...summary, resolutions: undefined }).map((field) => field.key),
    ['stages', 'elapsed', 'axes'],
  )
  assert.equal(summaryBrief(summary), `${AFFINE_STAGES_LABEL} in 2.5 s`)
})
