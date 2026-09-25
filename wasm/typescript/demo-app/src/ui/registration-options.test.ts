// Unit tests for the registration option decisions. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PIXEL_BUDGET_BYTES } from '../io/scale-select.ts'
import { DEFAULT_NUMBER_OF_RESOLUTIONS } from '../registration/types.ts'
import {
  BUDGET_OPTIONS_MIB,
  MAX_NUMBER_OF_RESOLUTIONS,
  MIN_NUMBER_OF_RESOLUTIONS,
  RESOLUTION_OPTIONS,
  budgetBytesForValue,
  budgetBytesOf,
  budgetEntries,
  budgetLabel,
  clampResolutions,
} from './registration-options.ts'

const MIB = 1024 * 1024

test('the resolutions picker offers 2 to 5 with 3 as the default', () => {
  assert.equal(MIN_NUMBER_OF_RESOLUTIONS, 2)
  assert.equal(MAX_NUMBER_OF_RESOLUTIONS, 5)
  assert.deepEqual(RESOLUTION_OPTIONS, [2, 3, 4, 5])
  assert.ok(RESOLUTION_OPTIONS.includes(DEFAULT_NUMBER_OF_RESOLUTIONS))
})

test('clampResolutions rounds, clamps, parses picker strings, and falls back to the default', () => {
  assert.equal(clampResolutions(4), 4)
  assert.equal(clampResolutions('4'), 4)
  assert.equal(clampResolutions(2.4), 2)
  assert.equal(clampResolutions(1), MIN_NUMBER_OF_RESOLUTIONS)
  assert.equal(clampResolutions(9), MAX_NUMBER_OF_RESOLUTIONS)
  assert.equal(clampResolutions(null), DEFAULT_NUMBER_OF_RESOLUTIONS)
  assert.equal(clampResolutions(undefined), DEFAULT_NUMBER_OF_RESOLUTIONS)
  assert.equal(clampResolutions('many'), DEFAULT_NUMBER_OF_RESOLUTIONS)
  assert.equal(clampResolutions(Number.NaN), DEFAULT_NUMBER_OF_RESOLUTIONS)
})

test('the budget picker offers 10, 25, 50, and 100 MB, and the default budget is one of them', () => {
  assert.deepEqual(BUDGET_OPTIONS_MIB, [10, 25, 50, 100])
  assert.equal(budgetBytesOf(50), PIXEL_BUDGET_BYTES)
  assert.deepEqual(
    budgetEntries(),
    [10, 25, 50, 100].map((mib) => ({ value: String(mib * MIB), bytes: mib * MIB, label: `${mib} MB` })),
  )
})

test('budgetEntries adds a budget the presets lack, in size order, and labels it with its fraction', () => {
  const entries = budgetEntries(4 * MIB)
  assert.deepEqual(
    entries.map((entry) => entry.label),
    ['4 MB', '10 MB', '25 MB', '50 MB', '100 MB'],
  )
  const half = budgetEntries(Math.round(0.5 * MIB))
  assert.equal(half[0]!.label, '512.0 KB')
  assert.equal(half.length, 5)
  // A preset is not duplicated, and nonsense is ignored.
  assert.equal(budgetEntries(25 * MIB).length, 4)
  assert.equal(budgetEntries(0).length, 4)
  assert.equal(budgetEntries(Number.NaN).length, 4)
})

test('budgetLabel shows whole mebibytes without a fraction and others as formatBytes does', () => {
  assert.equal(budgetLabel(100 * MIB), '100 MB')
  assert.equal(budgetLabel(1.5 * MIB), '1.5 MB')
  assert.equal(budgetLabel(2048), '2.0 KB')
})

test('budgetBytesForValue reads the picker value back and refuses anything else', () => {
  assert.equal(budgetBytesForValue(String(25 * MIB)), 25 * MIB)
  assert.equal(budgetBytesForValue('0'), undefined)
  assert.equal(budgetBytesForValue('-5'), undefined)
  assert.equal(budgetBytesForValue('1.5'), undefined)
  assert.equal(budgetBytesForValue(''), undefined)
  assert.equal(budgetBytesForValue(null), undefined)
  assert.equal(budgetBytesForValue(42), undefined)
})
