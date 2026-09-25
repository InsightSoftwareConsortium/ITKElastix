// Unit tests for the formatting helpers. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatBytes, formatElapsed } from './format.ts'

test('formatBytes picks the unit from the magnitude', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(50 * 1024 * 1024), '50.0 MB')
})

test('formatElapsed shows tenths of a second below a minute', () => {
  assert.equal(formatElapsed(0), '0.0 s')
  assert.equal(formatElapsed(340), '0.3 s')
  assert.equal(formatElapsed(12_345), '12.3 s')
  assert.equal(formatElapsed(59_949), '59.9 s')
})

test('formatElapsed switches to minutes and zero-padded seconds', () => {
  assert.equal(formatElapsed(60_000), '1 min 00 s')
  assert.equal(formatElapsed(125_400), '2 min 05 s')
  assert.equal(formatElapsed(3_599_999), '59 min 59 s')
})

test('formatElapsed treats negative and non-finite input as zero', () => {
  assert.equal(formatElapsed(-5), '0.0 s')
  assert.equal(formatElapsed(Number.NaN), '0.0 s')
  assert.equal(formatElapsed(Number.POSITIVE_INFINITY), '0.0 s')
})
