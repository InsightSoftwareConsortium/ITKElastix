// Unit tests for the decisions behind the download controls. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { IMAGE_FORMATS, TRANSFORM_FORMATS, imageFormatById, transformFormatById } from '../io/formats.ts'
import { createStore, formatChosen } from '../state.ts'
import { formatTooltip, pickerFormats, progressPercent, selectedFormat } from './download-controls.ts'

test('each picker lists its registry in order', () => {
  assert.equal(pickerFormats('image'), IMAGE_FORMATS)
  assert.equal(pickerFormats('transform'), TRANSFORM_FORMATS)
})

test('selectedFormat follows the store, starting on the OME-Zarr defaults', () => {
  const store = createStore()
  assert.equal(selectedFormat(store.state, 'image'), imageFormatById('ozx'))
  assert.equal(selectedFormat(store.state, 'transform'), transformFormatById('ozx-transform'))

  store.update(formatChosen('image', 'png'))
  store.update(formatChosen('transform', 'tfm'))
  assert.equal(selectedFormat(store.state, 'image'), imageFormatById('png'))
  assert.equal(selectedFormat(store.state, 'transform'), transformFormatById('tfm'))
})

test('formatTooltip names what the button writes, the format, and its description', () => {
  assert.equal(
    formatTooltip('image', { label: 'NRRD (.nrrd)', description: 'A header and the pixels.' }),
    'Download the registered image as NRRD (.nrrd). A header and the pixels.',
  )
  assert.equal(
    formatTooltip('transform', transformFormatById('elastix-json')),
    `Download the fixed-to-moving transform as elastix TransformParameters (.json). ${transformFormatById('elastix-json').description}`,
  )
})

test('progressPercent rounds to whole percent and stays within the bar', () => {
  assert.equal(progressPercent({ completed: 0, total: 0 }), 0)
  assert.equal(progressPercent({ completed: 5, total: 0 }), 0)
  assert.equal(progressPercent({ completed: 0, total: 8 }), 0)
  assert.equal(progressPercent({ completed: 1, total: 8 }), 13)
  assert.equal(progressPercent({ completed: 4, total: 8 }), 50)
  assert.equal(progressPercent({ completed: 8, total: 8 }), 100)
  assert.equal(progressPercent({ completed: 9, total: 8 }), 100)
  assert.equal(progressPercent({ completed: -1, total: 8 }), 0)
  assert.equal(progressPercent({ completed: Number.NaN, total: 8 }), 0)
  assert.equal(progressPercent({ completed: 1, total: Number.NaN }), 0)
})
