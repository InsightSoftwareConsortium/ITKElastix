// Unit tests for the pure scale-selection helpers. Run with
// `pnpm test:unit` (Node's built-in test runner with type stripping); these
// stay out of test/ so Playwright never picks them up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PIXEL_BUDGET_BYTES,
  budgetBytesFromQuery,
  bytesPerElement,
  estimateLevelBytes,
  ngffImageBytes,
  planScaleFactors,
  selectScaleForBudget,
  shapeBytes,
  type ImageShapeInfo,
} from './scale-select.ts'

const MiB = 1024 * 1024

function image(dims: string[], shape: number[], dtype = 'uint8'): ImageShapeInfo {
  return { dims, data: { shape, dtype } }
}

test('bytesPerElement maps zarr dtypes to byte widths', () => {
  assert.equal(bytesPerElement('bool'), 1)
  assert.equal(bytesPerElement('int8'), 1)
  assert.equal(bytesPerElement('uint8'), 1)
  assert.equal(bytesPerElement('int16'), 2)
  assert.equal(bytesPerElement('uint16'), 2)
  assert.equal(bytesPerElement('float32'), 4)
  assert.equal(bytesPerElement('int32'), 4)
  assert.equal(bytesPerElement('uint64'), 8)
  assert.equal(bytesPerElement('float64'), 8)
  assert.throws(() => bytesPerElement('string'), /Unsupported image dtype/)
  assert.throws(() => bytesPerElement('v2:object'), /Unsupported image dtype/)
})

test('shapeBytes and ngffImageBytes multiply extents by element width', () => {
  assert.equal(shapeBytes([3, 4, 5], 'int16'), 120)
  assert.equal(ngffImageBytes(image(['z', 'y', 'x'], [1024, 1024, 1024], 'float32')), 4096 * MiB)
})

test('estimateLevelBytes shrinks spatial dims only and never below 1', () => {
  assert.equal(estimateLevelBytes(image(['z', 'y', 'x'], [100, 100, 100], 'uint16'), 3), 33 * 33 * 33 * 2)
  assert.equal(estimateLevelBytes(image(['c', 'y', 'x'], [3, 8, 8]), 2), 3 * 4 * 4)
  assert.equal(estimateLevelBytes(image(['t', 'z', 'y', 'x'], [5, 4, 4, 4]), 8), 5)
})

test('planScaleFactors returns [] when the base image fits the budget', () => {
  assert.deepEqual(planScaleFactors(image(['y', 'x'], [512, 512], 'int16')), [])
  assert.deepEqual(planScaleFactors(image(['z', 'y', 'x'], [256, 256, 256], 'int16')), [])
})

test('planScaleFactors doubles until the first level under budget', () => {
  // 1024^3 float32 = 4 GiB; /2 -> 512 MiB; /4 -> 64 MiB; /8 -> 8 MiB fits.
  assert.deepEqual(planScaleFactors(image(['z', 'y', 'x'], [1024, 1024, 1024], 'float32')), [2, 4, 8])
  // Exactly at the budget counts as fitting: 8192^2 uint8 = 64 MiB -> /2 = 16 MiB.
  assert.deepEqual(planScaleFactors(image(['y', 'x'], [8192, 8192]), 16 * MiB), [2])
})

test('planScaleFactors carries channel and time dims through unchanged', () => {
  // 3 channels x 8192^2 uint8 = 192 MiB; /2 -> 48 MiB fits the 50 MiB budget.
  assert.deepEqual(planScaleFactors(image(['c', 'y', 'x'], [3, 8192, 8192])), [2])
  assert.deepEqual(planScaleFactors(image(['t', 'y', 'x'], [3, 8192, 8192])), [2])
})

test('planScaleFactors terminates once spatial extents collapse to 1', () => {
  // 64 channels alone exceed an 8-byte budget; must stop rather than loop.
  assert.deepEqual(planScaleFactors(image(['c', 'y', 'x'], [64, 4, 4]), 8), [2, 4])
})

test('selectScaleForBudget picks the finest level that fits, else the coarsest', () => {
  const pyramid = {
    images: [
      image(['y', 'x'], [4096, 4096], 'float32'), // 64 MiB
      image(['y', 'x'], [2048, 2048], 'float32'), // 16 MiB
      image(['y', 'x'], [1024, 1024], 'float32'), // 4 MiB
    ],
  }
  assert.equal(selectScaleForBudget(pyramid, PIXEL_BUDGET_BYTES), 1)
  assert.equal(selectScaleForBudget(pyramid, 100 * MiB), 0)
  assert.equal(selectScaleForBudget(pyramid, 1024), 2)
  assert.equal(selectScaleForBudget({ images: [image(['y', 'x'], [4, 4])] }), 0)
})

test('selectScaleForBudget rejects an empty pyramid', () => {
  assert.throws(() => selectScaleForBudget({ images: [] }), /empty multiscales/)
})

test('budgetBytesFromQuery reads ?budget=<MiB> and falls back otherwise', () => {
  assert.equal(budgetBytesFromQuery(''), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?other=1'), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?budget=4'), 4 * MiB)
  assert.equal(budgetBytesFromQuery('budget=4'), 4 * MiB)
  assert.equal(budgetBytesFromQuery('?x=1&budget=0.5'), MiB / 2)
  assert.equal(budgetBytesFromQuery('?budget=abc'), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?budget=0'), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?budget=-3'), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?budget='), PIXEL_BUDGET_BYTES)
  assert.equal(budgetBytesFromQuery('?budget=abc', 7), 7)
  // Tiny values never round down to a zero budget.
  assert.equal(budgetBytesFromQuery('?budget=0.0000001'), 1)
})
