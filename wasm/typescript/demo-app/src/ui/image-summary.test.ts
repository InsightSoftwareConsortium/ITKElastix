// Unit tests for the loaded-image summary fields. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from '../io/load-image.ts'
import {
  axisLabels,
  downsampleFactor,
  formatShape,
  formatSpacing,
  imageSummaryFields,
  scaleUsedLabel,
  shortSummary,
} from './image-summary.ts'

function fakeImage(overrides: Record<string, unknown> = {}): LoadedImage {
  return {
    name: 'brain.nii.gz',
    kind: 'itk',
    dimension: 3,
    scaleIndex: 1,
    multiscales: {
      images: [{ scale: { x: 1, y: 1, z: 1 } }, { scale: { x: 2, y: 2, z: 2 } }, { scale: { x: 4, y: 4, z: 4 } }],
    },
    ngffImage: { scale: { x: 2, y: 2, z: 2 } },
    itkImage: {
      size: [128, 96, 64],
      spacing: [1.5, 1.5, 2],
      imageType: { dimension: 3, componentType: 'int16', pixelType: 'Scalar', components: 1 },
    },
    registrationBytes: 128 * 96 * 64 * 2,
    budgetBytes: 50 * 1024 * 1024,
    channelCount: 1,
    channelIndex: 0,
    timepointCount: 1,
    ...overrides,
  } as unknown as LoadedImage
}

function fieldMap(image: LoadedImage): Record<string, string> {
  return Object.fromEntries(imageSummaryFields(image).map((field) => [field.key, field.value]))
}

test('formats shapes, axis labels, and spacing', () => {
  assert.equal(formatShape([256, 256]), '256 × 256')
  assert.equal(formatShape([128, 96, 64]), '128 × 96 × 64')
  assert.equal(axisLabels(2), 'x × y')
  assert.equal(axisLabels(3), 'x × y × z')
  assert.equal(formatSpacing([0.9765625, 0.9765625]), '0.9766 × 0.9766')
  assert.equal(formatSpacing([1, 1, 2.5]), '1 × 1 × 2.5')
})

test('reads the downsample factor from the x scale ratio', () => {
  assert.equal(downsampleFactor(fakeImage({ scaleIndex: 0 })), undefined)
  assert.equal(downsampleFactor(fakeImage()), 2)
  assert.equal(downsampleFactor(fakeImage({ scaleIndex: 2, ngffImage: { scale: { x: 4 } } })), 4)
  // OME-TIFF levels derive their scale from the width ratio (197/98).
  assert.equal(downsampleFactor(fakeImage({ ngffImage: { scale: { x: 2.0102 } } })), 2)
  assert.equal(downsampleFactor(fakeImage({ ngffImage: { scale: { x: 2.55 } } })), 2.6)
  // No x scale on the base level: unknown factor.
  const noScale = fakeImage({ multiscales: { images: [{ scale: {} }, { scale: { x: 2 } }] } })
  assert.equal(downsampleFactor(noScale), undefined)
  assert.equal(scaleUsedLabel(noScale), '1')
})

test('labels the scale used', () => {
  assert.equal(scaleUsedLabel(fakeImage({ scaleIndex: 0 })), '0 (full resolution)')
  assert.equal(scaleUsedLabel(fakeImage()), '1 (downsampled ÷2)')
})

test('lists the base fields in order for a plain 3D volume', () => {
  const fields = imageSummaryFields(fakeImage())
  assert.deepEqual(
    fields.map((field) => field.key),
    ['name', 'dimension', 'shape', 'dtype', 'spacing', 'levels', 'scale', 'bytes'],
  )
  assert.deepEqual(fieldMap(fakeImage()), {
    name: 'brain.nii.gz',
    dimension: '3D',
    shape: '128 × 96 × 64',
    dtype: 'int16',
    spacing: '1.5 × 1.5 × 2',
    levels: '3',
    scale: '1 (downsampled ÷2)',
    bytes: '1.5 MB',
  })
  assert.equal(fields[2].label, 'Shape (x × y × z)')
})

test('adds channel, time point, and squeezed rows only when they apply', () => {
  const rgb = fakeImage({
    dimension: 2,
    scaleIndex: 0,
    itkImage: {
      size: [256, 256],
      spacing: [1, 1],
      imageType: { dimension: 2, componentType: 'uint8', pixelType: 'Scalar', components: 1 },
    },
    registrationBytes: 256 * 256,
    channelCount: 3,
    channelIndex: 0,
    timepointCount: 2,
    squeezedAxis: 'z',
  })
  const fields = fieldMap(rgb)
  assert.equal(fields.channel, '1 of 3')
  assert.equal(fields.timepoint, '1 of 2')
  assert.equal(fields.squeezed, 'single z slice, registered as 2D')
  assert.equal(fields.scale, '0 (full resolution)')
  assert.equal(fields.bytes, '64.0 KB')
  assert.equal(imageSummaryFields(rgb).find((field) => field.key === 'shape')?.label, 'Shape (x × y)')
  assert.equal(shortSummary(rgb), '2D 256 × 256 uint8, 64.0 KB')
})
