// Unit tests for the overlay mode decisions. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_COLORMAP,
  OVERLAY_OPACITY_STEP,
  clampOpacity,
  formatOpacity,
} from './overlay-options.ts'

test('the overlay is drawn in red, half transparent, in twentieths', () => {
  assert.equal(OVERLAY_COLORMAP, 'Red')
  assert.equal(DEFAULT_OVERLAY_OPACITY, 0.5)
  assert.equal(OVERLAY_OPACITY_STEP, 0.05)
  assert.ok(Number.isInteger(1 / OVERLAY_OPACITY_STEP), 'the step must divide the 0..1 range evenly')
})

test('clampOpacity keeps values in range and passes the rest through', () => {
  assert.equal(clampOpacity(0), 0)
  assert.equal(clampOpacity(0.35), 0.35)
  assert.equal(clampOpacity(1), 1)
  assert.equal(clampOpacity(-0.2), 0)
  assert.equal(clampOpacity(1.7), 1)
})

test('clampOpacity falls back to the default for anything that is not a finite number', () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '0.5', {}]) {
    assert.equal(clampOpacity(value), DEFAULT_OVERLAY_OPACITY, String(value))
  }
})

test('formatOpacity shows a whole percentage', () => {
  assert.equal(formatOpacity(0), '0%')
  assert.equal(formatOpacity(0.5), '50%')
  assert.equal(formatOpacity(0.45), '45%')
  assert.equal(formatOpacity(0.4500000000000001), '45%')
  assert.equal(formatOpacity(1), '100%')
  assert.equal(formatOpacity(2), '100%')
  assert.equal(formatOpacity(Number.NaN), '50%')
})
