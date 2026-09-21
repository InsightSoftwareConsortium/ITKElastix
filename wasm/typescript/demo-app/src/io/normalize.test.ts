// Unit tests for the registration input normalization. Run with
// `pnpm test:unit` (Node's built-in test runner with type stripping).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Image } from 'itk-wasm'

import {
  REGISTRATION_CHANNEL_INDEX,
  REGISTRATION_TIMEPOINT_INDEX,
  SPATIAL_AXES,
  assertCompatiblePair,
  channelAndTimepointInfo,
  findSingletonAxis,
  normalizeForRegistration,
  registrationBytesOf,
  registrationSliceOptions,
  squeezeAxis,
  squeezeSingletonAxis,
} from './normalize.ts'
import type { ImageShapeInfo } from './scale-select.ts'
import { promoteTo3d } from '../viewer/promote-to-3d.ts'

const IDENTITY_3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function level(dims: string[], shape: number[], dtype = 'uint8'): ImageShapeInfo {
  return { dims, data: { shape, dtype } }
}

interface VolumeOptions {
  size?: number[]
  direction?: number[]
  components?: number
  data?: Image['data']
}

function volume({
  size = [4, 3, 1],
  direction = IDENTITY_3,
  components = 1,
  data = new Int16Array(size.reduce((n, e) => n * e, 1) * components).fill(7),
}: VolumeOptions = {}): Image {
  return {
    imageType: {
      dimension: 3,
      componentType: 'int16',
      pixelType: components === 1 ? 'Scalar' : 'VariableLengthVector',
      components,
    },
    name: 'slab',
    origin: [10, -20, 30],
    spacing: [0.5, 0.75, 2],
    direction: new Float64Array(direction),
    size,
    metadata: new Map([['unit', 'mm']]),
    data,
  }
}

function slice2d(): Image {
  return {
    imageType: { dimension: 2, componentType: 'uint8', pixelType: 'Scalar', components: 1 },
    name: 'slice',
    origin: [1, 2],
    spacing: [1, 1],
    direction: new Float64Array([1, 0, 0, 1]),
    size: [5, 6],
    metadata: new Map(),
    data: new Uint8Array(30),
  }
}

test('registration slice options name the first time point and channel only when those axes exist', () => {
  assert.equal(REGISTRATION_TIMEPOINT_INDEX, 0)
  assert.equal(REGISTRATION_CHANNEL_INDEX, 0)
  assert.deepEqual(registrationSliceOptions(level(['t', 'c', 'z', 'y', 'x'], [2, 3, 4, 5, 6])), {
    tIndex: 0,
    cIndex: 0,
  })
  assert.deepEqual(registrationSliceOptions(level(['y', 'x', 'c'], [5, 6, 3])), { cIndex: 0 })
  assert.deepEqual(registrationSliceOptions(level(['t', 'z', 'y', 'x'], [2, 4, 5, 6])), { tIndex: 0 })
  assert.deepEqual(registrationSliceOptions(level(['z', 'y', 'x'], [4, 5, 6])), {})
})

test('channel and time point counts come from the c and t extents and default to 1', () => {
  assert.deepEqual(channelAndTimepointInfo(level(['t', 'c', 'z', 'y', 'x'], [7, 3, 4, 5, 6])), {
    channelCount: 3,
    channelIndex: 0,
    timepointCount: 7,
  })
  assert.deepEqual(channelAndTimepointInfo(level(['y', 'x', 'c'], [5, 6, 4])), {
    channelCount: 4,
    channelIndex: 0,
    timepointCount: 1,
  })
  assert.deepEqual(channelAndTimepointInfo(level(['z', 'y', 'x'], [4, 5, 6])), {
    channelCount: 1,
    channelIndex: 0,
    timepointCount: 1,
  })
})

test('findSingletonAxis prefers the last single-slice axis', () => {
  assert.equal(findSingletonAxis([256, 256, 1]), 2)
  assert.equal(findSingletonAxis([256, 1, 256]), 1)
  assert.equal(findSingletonAxis([1, 256, 256]), 0)
  assert.equal(findSingletonAxis([1, 1, 5]), 1)
  assert.equal(findSingletonAxis([1, 1, 1]), 2)
  assert.equal(findSingletonAxis([256, 256, 3]), undefined)
  assert.equal(findSingletonAxis([]), undefined)
  assert.equal(SPATIAL_AXES[2], 'z')
})

test('squeezing z keeps x and y metadata and the top-left direction block', () => {
  const squeezed = squeezeAxis(volume({ direction: [0, 1, 0, -1, 0, 0, 0, 0, 1] }), 2)
  assert.equal(squeezed.imageType.dimension, 2)
  assert.equal(squeezed.imageType.componentType, 'int16')
  assert.equal(squeezed.imageType.pixelType, 'Scalar')
  assert.equal(squeezed.imageType.components, 1)
  assert.deepEqual(squeezed.size, [4, 3])
  assert.deepEqual(squeezed.spacing, [0.5, 0.75])
  assert.deepEqual(squeezed.origin, [10, -20])
  assert.deepEqual(Array.from(squeezed.direction as Float64Array), [0, 1, -1, 0])
  assert.equal(squeezed.name, 'slab')
})

test('squeezing y or x strikes out that row and column of the direction', () => {
  const direction = [11, 12, 13, 21, 22, 23, 31, 32, 33]
  const noY = squeezeAxis(volume({ size: [4, 1, 3], direction }), 1)
  assert.deepEqual(noY.size, [4, 3])
  assert.deepEqual(noY.spacing, [0.5, 2])
  assert.deepEqual(noY.origin, [10, 30])
  assert.deepEqual(Array.from(noY.direction as Float64Array), [11, 13, 31, 33])

  const noX = squeezeAxis(volume({ size: [1, 3, 4], direction }), 0)
  assert.deepEqual(noX.size, [3, 4])
  assert.deepEqual(noX.spacing, [0.75, 2])
  assert.deepEqual(noX.origin, [-20, 30])
  assert.deepEqual(Array.from(noX.direction as Float64Array), [22, 23, 32, 33])
})

test('squeezeAxis shares the pixel buffer, copies the metadata, and leaves the input untouched', () => {
  const source = volume()
  const squeezed = squeezeAxis(source, 2)
  assert.equal(squeezed.data, source.data)
  assert.notEqual(squeezed.metadata, source.metadata)
  assert.deepEqual([...squeezed.metadata], [...source.metadata])
  assert.equal(source.imageType.dimension, 3)
  assert.deepEqual(source.size, [4, 3, 1])
  assert.deepEqual(source.spacing, [0.5, 0.75, 2])
  assert.deepEqual(source.origin, [10, -20, 30])
  assert.equal(source.direction.length, 9)
})

test('squeezeAxis rejects the wrong dimension, axis, extent, or direction size', () => {
  assert.throws(() => squeezeAxis(slice2d(), 1), /expects a 3D image, got 2D/)
  assert.throws(() => squeezeAxis(volume(), 3), /axis index of 0, 1, or 2, got 3/)
  assert.throws(() => squeezeAxis(volume(), 1.5), /axis index of 0, 1, or 2, got 1.5/)
  assert.throws(() => squeezeAxis(volume(), 0), /Cannot squeeze the x axis: its extent is 4/)
  assert.throws(() => squeezeAxis(volume({ direction: [1, 0, 0, 1] }), 2), /expects a 3x3 direction, got 4/)
})

test('squeezeSingletonAxis squeezes only single-slice 3D images', () => {
  const stack = volume()
  const squeezed = squeezeSingletonAxis(stack)
  assert.equal(squeezed.squeezedAxis, 'z')
  assert.equal(squeezed.image.imageType.dimension, 2)
  assert.deepEqual(squeezed.image.size, [4, 3])

  const sagittal = squeezeSingletonAxis(volume({ size: [1, 3, 4] }))
  assert.equal(sagittal.squeezedAxis, 'x')
  assert.deepEqual(sagittal.image.size, [3, 4])

  const thick = volume({ size: [4, 3, 2] })
  assert.deepEqual(squeezeSingletonAxis(thick), { image: thick, squeezedAxis: undefined })

  const flat = slice2d()
  assert.deepEqual(squeezeSingletonAxis(flat), { image: flat, squeezedAxis: undefined })
})

test('squeezing the z axis inverts promoteTo3d', () => {
  const original = slice2d()
  original.direction = new Float64Array([0, -1, 1, 0])
  const roundTrip = squeezeAxis(promoteTo3d(original), 2)
  assert.deepEqual(roundTrip.size, original.size)
  assert.deepEqual(roundTrip.spacing, original.spacing)
  assert.deepEqual(roundTrip.origin, original.origin)
  assert.deepEqual(Array.from(roundTrip.direction as Float64Array), Array.from(original.direction as Float64Array))
  assert.equal(roundTrip.data, original.data)
})

test('registrationBytesOf measures the buffer, or the extents when there is none', () => {
  assert.equal(registrationBytesOf(volume()), 4 * 3 * 1 * 2)
  assert.equal(registrationBytesOf(volume({ size: [4, 3, 2], data: null })), 4 * 3 * 2 * 2)
  const rgb = volume({ size: [4, 3, 2], components: 3, data: null })
  assert.equal(registrationBytesOf(rgb), 4 * 3 * 2 * 3 * 2)
  const float = { ...slice2d(), imageType: { ...slice2d().imageType, componentType: 'float32' as const }, data: null }
  assert.equal(registrationBytesOf(float), 5 * 6 * 4)
})

test('normalizeForRegistration squeezes a single-slice volume and measures the 2D result', () => {
  const normalized = normalizeForRegistration(volume(), 'slab.nii.gz')
  assert.equal(normalized.dimension, 2)
  assert.equal(normalized.squeezedAxis, 'z')
  assert.deepEqual(normalized.itkImage.size, [4, 3])
  assert.equal(normalized.registrationBytes, 4 * 3 * 2)
})

test('normalizeForRegistration passes a thick volume and a 2D image through unchanged', () => {
  const thick = volume({ size: [4, 3, 2] })
  const normalizedThick = normalizeForRegistration(thick)
  assert.equal(normalizedThick.itkImage, thick)
  assert.equal(normalizedThick.dimension, 3)
  assert.equal(normalizedThick.squeezedAxis, undefined)
  assert.equal(normalizedThick.registrationBytes, 4 * 3 * 2 * 2)

  const flat = slice2d()
  const normalizedFlat = normalizeForRegistration(flat)
  assert.equal(normalizedFlat.itkImage, flat)
  assert.equal(normalizedFlat.dimension, 2)
  assert.equal(normalizedFlat.registrationBytes, 30)
})

test('normalizeForRegistration rejects vector images and dimensions other than 2 or 3', () => {
  assert.throws(
    () => normalizeForRegistration(volume({ components: 3 }), 'photo.png'),
    /Expected a scalar image for registration, got 3 components \(VariableLengthVector\) in photo.png/,
  )
  const series: Image = {
    ...volume({ size: [4, 3, 2] }),
    imageType: { dimension: 4, componentType: 'int16', pixelType: 'Scalar', components: 1 },
    size: [4, 3, 2, 5],
  }
  assert.throws(() => normalizeForRegistration(series, 'series.nii'), /Expected a 2D or 3D image after ingest, got 4D \(series.nii\)/)
  const line: Image = {
    ...slice2d(),
    imageType: { dimension: 1, componentType: 'uint8', pixelType: 'Scalar', components: 1 },
    size: [5],
  }
  assert.throws(() => normalizeForRegistration(line, 'line.mha'), /got 1D \(line.mha\)/)
})

function input(name: string, dimension: number, components = 1) {
  return {
    name,
    dimension,
    itkImage: {
      imageType: {
        dimension,
        componentType: 'uint8' as const,
        pixelType: components === 1 ? ('Scalar' as const) : ('RGB' as const),
        components,
      },
    },
  }
}

test('assertCompatiblePair accepts two scalar images of the same dimension', () => {
  assert.doesNotThrow(() => assertCompatiblePair(input('a.mha', 2), input('b.mha', 2)))
  assert.doesNotThrow(() => assertCompatiblePair(input('a.nii.gz', 3), input('b.nii.gz', 3)))
})

test('assertCompatiblePair names both images and the word dimension when they differ', () => {
  assert.throws(
    () => assertCompatiblePair(input('CT_2D_head_fixed.mha', 2), input('tpl-MNI305_T1w.nii.gz', 3)),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /fixed image CT_2D_head_fixed.mha is 2D/)
      assert.match(error.message, /moving image tpl-MNI305_T1w.nii.gz is 3D/)
      assert.match(error.message, /same dimension/)
      return true
    },
  )
})

test('assertCompatiblePair rejects a vector image and says which one', () => {
  assert.throws(() => assertCompatiblePair(input('photo.png', 2, 3), input('b.mha', 2)), /fixed image photo.png has 3 components \(RGB\)/)
  assert.throws(() => assertCompatiblePair(input('a.mha', 2), input('photo.png', 2, 3)), /moving image photo.png has 3 components/)
})
