// Unit tests for the view control decisions. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SLICE_TYPE } from '@niivue/niivue'

import type { LoadedImage } from '../io/load-image.ts'
import { createStore, inputsLoaded } from '../state.ts'
import {
  CROSSHAIR_WIDTH,
  DEFAULT_COLORMAP,
  DEFAULT_SLICE_TYPE,
  DEFAULT_SLICE_TYPE_ID,
  SLICE_TYPE_OPTIONS,
  VOLUME_GRADIENT_OPACITY,
  colormapOptions,
  crosshairWidthForDimension,
  gradientOpacityForDimension,
  isSliceTypeId,
  showsSliceTypePicker,
  sliceTypeForDimension,
  sliceTypeForId,
  sliceTypeIdFor,
} from './view-options.ts'

function fakeImage(dimension: 2 | 3): LoadedImage {
  return { name: `${dimension}d`, dimension } as unknown as LoadedImage
}

test('the picker offers the four slice layouts and the render, each mapped to its niivue value', () => {
  assert.deepEqual(
    SLICE_TYPE_OPTIONS.map((option) => option.id),
    ['axial', 'coronal', 'sagittal', 'multiplanar', 'render'],
  )
  assert.deepEqual(
    Object.fromEntries(SLICE_TYPE_OPTIONS.map((option) => [option.id, option.sliceType])),
    {
      axial: SLICE_TYPE.AXIAL,
      coronal: SLICE_TYPE.CORONAL,
      sagittal: SLICE_TYPE.SAGITTAL,
      multiplanar: SLICE_TYPE.MULTIPLANAR,
      render: SLICE_TYPE.RENDER,
    },
  )
  assert.ok(SLICE_TYPE_OPTIONS.every((option) => option.label.length > 0))
})

test('the default layout is multiplanar under both names', () => {
  assert.equal(DEFAULT_SLICE_TYPE_ID, 'multiplanar')
  assert.equal(DEFAULT_SLICE_TYPE, SLICE_TYPE.MULTIPLANAR)
  assert.equal(sliceTypeForId(DEFAULT_SLICE_TYPE_ID), DEFAULT_SLICE_TYPE)
})

test('ids and slice type values round-trip; values the picker does not offer have no id', () => {
  for (const option of SLICE_TYPE_OPTIONS) {
    assert.equal(sliceTypeForId(option.id), option.sliceType)
    assert.equal(sliceTypeIdFor(option.sliceType), option.id)
  }
  assert.equal(sliceTypeIdFor(SLICE_TYPE.NONE), undefined)
  assert.equal(sliceTypeIdFor(42), undefined)
  assert.throws(() => sliceTypeForId('mosaic' as never), /Unknown slice type: mosaic/)
})

test('isSliceTypeId accepts the picker ids and nothing else', () => {
  for (const option of SLICE_TYPE_OPTIONS) {
    assert.equal(isSliceTypeId(option.id), true)
  }
  assert.equal(isSliceTypeId('mosaic'), false)
  assert.equal(isSliceTypeId(''), false)
  assert.equal(isSliceTypeId(null), false)
  assert.equal(isSliceTypeId(SLICE_TYPE.AXIAL), false)
})

test('2D content is always axial; 3D content takes the chosen layout', () => {
  for (const option of SLICE_TYPE_OPTIONS) {
    assert.equal(sliceTypeForDimension(2, option.sliceType), SLICE_TYPE.AXIAL)
    assert.equal(sliceTypeForDimension(3, option.sliceType), option.sliceType)
  }
})

test('a 2D image is drawn without a crosshair, a 3D image with one', () => {
  assert.equal(crosshairWidthForDimension(2), 0)
  assert.equal(crosshairWidthForDimension(3), CROSSHAIR_WIDTH)
  assert.ok(CROSSHAIR_WIDTH > 0)
})

test('a 3D image is rendered with gradient opacity, a 2D image without', () => {
  assert.equal(gradientOpacityForDimension(2), 0)
  assert.equal(gradientOpacityForDimension(3), VOLUME_GRADIENT_OPACITY)
  // niivue clamps the setting to [0, 1]; 0 would switch it off.
  assert.ok(VOLUME_GRADIENT_OPACITY > 0 && VOLUME_GRADIENT_OPACITY <= 1)
})

test('the layout picker shows for a 3D pair only', () => {
  const store = createStore()
  assert.equal(showsSliceTypePicker(store.state), false)
  store.update(inputsLoaded(fakeImage(2), fakeImage(2)))
  assert.equal(showsSliceTypePicker(store.state), false)
  store.update(inputsLoaded(fakeImage(3), fakeImage(3)))
  assert.equal(showsSliceTypePicker(store.state), true)
})

test('colormap options are sorted case-insensitively and always include the default', () => {
  assert.equal(DEFAULT_COLORMAP, 'Gray')
  assert.deepEqual(colormapOptions(['Red', 'Hot', 'Gray', 'Blue2cyan']), ['Blue2cyan', 'Gray', 'Hot', 'Red'])
  assert.deepEqual(colormapOptions(['Red', 'Hot']), ['Gray', 'Hot', 'Red'])
  assert.deepEqual(colormapOptions([]), ['Gray'])
})

test('colormap options drop niivue internal tables, blanks, and duplicates', () => {
  assert.deepEqual(colormapOptions(['_draw', '_itksnap', 'Hot', 'Hot', '', 'hot', 'gray']), ['Gray', 'Hot'])
})
