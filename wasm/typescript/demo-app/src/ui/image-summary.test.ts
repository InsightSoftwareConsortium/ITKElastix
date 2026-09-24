// Unit tests for the loaded-image summary fields. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from '../io/load-image.ts'
import type { RegistrationResult } from '../registration/types.ts'
import { createStore, type AppState } from '../state.ts'
import {
  axisLabels,
  comparisonDetails,
  contentTitle,
  downsampleFactor,
  formatShape,
  formatSpacing,
  imageDetailFields,
  imageSummaryFields,
  panelDetails,
  resultBrief,
  resultDetailFields,
  scaleUsedLabel,
  shortSummary,
} from './image-summary.ts'

function fakeImage(overrides: Record<string, unknown> = {}): LoadedImage {
  return {
    name: 'brain.nii.gz',
    kind: 'itk',
    format: 'ITK',
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

function fakeResult(overrides: Record<string, unknown> = {}): RegistrationResult {
  return {
    image: {
      size: [128, 96, 64],
      spacing: [1.5, 1.5, 2],
      imageType: { dimension: 3, componentType: 'float32', pixelType: 'Scalar', components: 1 },
    },
    elapsedMs: 2345,
    ...overrides,
  } as unknown as RegistrationResult
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

test('image details add the source format after the name and the budget after the bytes', () => {
  const fields = imageDetailFields(fakeImage({ kind: 'tiff', format: 'OME-TIFF' }))
  assert.deepEqual(
    fields.map((field) => field.key),
    ['name', 'source', 'dimension', 'shape', 'dtype', 'spacing', 'levels', 'scale', 'bytes', 'budget'],
  )
  const values = Object.fromEntries(fields.map((field) => [field.key, field.value]))
  assert.equal(values.source, 'OME-TIFF')
  assert.equal(values.budget, '50.0 MB')
  assert.equal(fields.find((field) => field.key === 'budget')?.label, 'Pixel budget')
  // A `?budget=4` load shows the budget it was selected under.
  assert.equal(
    imageDetailFields(fakeImage({ budgetBytes: 4 * 1024 * 1024 })).find((field) => field.key === 'budget')?.value,
    '4.0 MB',
  )
  // The optional rows still trail the list.
  const squeezed = imageDetailFields(fakeImage({ squeezedAxis: 'z', channelCount: 3 }))
  assert.deepEqual(squeezed.slice(-3).map((field) => field.key), ['budget', 'channel', 'squeezed'])
})

test('result details say the result comparison shows the result on the fixed grid', () => {
  const fixed = fakeImage({ name: 'fixed.nii.gz' })
  const moving = fakeImage({ name: 'moving.nii.gz' })
  const fields = resultDetailFields(fakeResult(), fixed, moving)
  assert.deepEqual(
    fields.map((field) => field.key),
    ['displaying', 'name', 'moving', 'grid', 'dimension', 'shape', 'dtype', 'spacing', 'transform', 'elapsed'],
  )
  const values = Object.fromEntries(fields.map((field) => [field.key, field.value]))
  assert.equal(values.displaying, 'Registered result on the fixed grid')
  assert.equal(values.name, 'registered')
  assert.equal(values.moving, 'moving.nii.gz')
  assert.equal(values.grid, 'fixed.nii.gz (fixed grid)')
  assert.equal(values.dimension, '3D')
  assert.equal(values.shape, '128 × 96 × 64')
  assert.equal(values.dtype, 'float32')
  assert.equal(values.spacing, '1.5 × 1.5 × 2')
  assert.equal(values.transform, 'translation → rigid → affine')
  assert.equal(values.elapsed, '2.3 s')
  assert.equal(fields.find((field) => field.key === 'shape')?.label, 'Shape (x × y × z)')
  assert.equal(resultBrief(fakeResult()), '3D 128 × 96 × 64 float32 on the fixed grid')
})

test('panelDetails follows the store: the inputs, then the result on the result comparison while it is shown', () => {
  const fixed = fakeImage({ name: 'fixed.nii.gz' })
  const moving = fakeImage({ name: 'moving.ome.zarr.ozx', kind: 'ozx', format: 'OZX' })
  const empty: AppState = createStore().state
  for (const role of ['inputs-fixed', 'inputs-moving', 'result-fixed', 'result-moving'] as const) {
    assert.equal(panelDetails(empty, role), undefined, role)
  }

  const loaded: AppState = { ...empty, fixed, moving }
  for (const role of ['inputs-fixed', 'result-fixed'] as const) {
    const fixedDetails = panelDetails(loaded, role)
    assert.equal(fixedDetails?.content, 'fixed', role)
    assert.equal(fixedDetails?.brief, '3D 128 × 96 × 64 int16, 1.5 MB')
    assert.equal(fixedDetails?.fields[0]?.value, 'fixed.nii.gz')
  }
  for (const role of ['inputs-moving', 'result-moving'] as const) {
    const movingDetails = panelDetails(loaded, role)
    assert.equal(movingDetails?.content, 'moving', role)
    assert.equal(movingDetails?.fields.find((field) => field.key === 'source')?.value, 'OZX')
  }
  // The switch alone, without a result, changes nothing.
  assert.equal(panelDetails({ ...loaded, showResult: true }, 'result-moving')?.content, 'moving')

  const shown: AppState = { ...loaded, result: fakeResult(), showResult: true }
  const resultDetails = panelDetails(shown, 'result-moving')
  assert.equal(resultDetails?.content, 'result')
  assert.equal(resultDetails?.brief, '3D 128 × 96 × 64 float32 on the fixed grid')
  assert.equal(resultDetails?.fields[0]?.value, 'Registered result on the fixed grid')
  // The inputs comparison and both fixed sides are never touched by the
  // switch, and switching it off restores the moving input.
  assert.equal(panelDetails(shown, 'inputs-moving')?.content, 'moving')
  assert.equal(panelDetails(shown, 'inputs-fixed')?.content, 'fixed')
  assert.equal(panelDetails(shown, 'result-fixed')?.content, 'fixed')
  assert.equal(panelDetails({ ...shown, showResult: false }, 'result-moving')?.content, 'moving')
})

test('comparisonDetails pairs the two sides and names both in its brief', () => {
  const fixed = fakeImage({ name: 'fixed.nii.gz' })
  const moving = fakeImage({ name: 'moving.nii.gz', dimension: 3 })
  const empty: AppState = createStore().state
  assert.equal(comparisonDetails(empty, 'inputs'), undefined)
  assert.equal(comparisonDetails({ ...empty, fixed }, 'inputs'), undefined, 'both sides load together')

  const loaded: AppState = { ...empty, fixed, moving }
  const inputs = comparisonDetails(loaded, 'inputs')!
  assert.equal(inputs.sides.fixed.content, 'fixed')
  assert.equal(inputs.sides.moving.content, 'moving')
  assert.equal(inputs.brief, 'Fixed 3D 128 × 96 × 64 int16, 1.5 MB · Moving 3D 128 × 96 × 64 int16, 1.5 MB')
  assert.deepEqual(comparisonDetails(loaded, 'result'), inputs, 'the same until a result is shown')

  const shown: AppState = { ...loaded, result: fakeResult(), showResult: true }
  const result = comparisonDetails(shown, 'result')!
  assert.equal(result.sides.fixed.content, 'fixed')
  assert.equal(result.sides.moving.content, 'result')
  assert.equal(result.brief, 'Fixed 3D 128 × 96 × 64 int16, 1.5 MB · Registered 3D 128 × 96 × 64 float32 on the fixed grid')
  assert.deepEqual(comparisonDetails(shown, 'inputs'), inputs, 'the inputs comparison is unchanged')
})

test('contentTitle heads each side', () => {
  assert.equal(contentTitle('fixed'), 'Fixed')
  assert.equal(contentTitle('moving'), 'Moving')
  assert.equal(contentTitle('result'), 'Registered')
})
