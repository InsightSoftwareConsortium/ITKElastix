// Unit tests for the TransformList clean-up. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Transform, TransformList } from 'itk-wasm'
import { withoutCompositeHeader, withTypedParameterArrays } from './transform-list.ts'

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
