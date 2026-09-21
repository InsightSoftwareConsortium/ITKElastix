// Unit tests for the display-only 2D -> 3D promotion. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Image } from 'itk-wasm'

import { promoteTo3d } from './promote-to-3d.ts'

function image2d(direction: number[] = [1, 0, 0, 1]): Image {
  return {
    imageType: { dimension: 2, componentType: 'int16', pixelType: 'Scalar', components: 1 },
    name: 'slice',
    origin: [10, -20],
    spacing: [0.5, 0.75],
    direction: new Float64Array(direction),
    size: [4, 3],
    metadata: new Map([['unit', 'mm']]),
    data: new Int16Array(12).fill(7),
  }
}

test('adds a unit third dimension and embeds the direction in a 3x3 matrix', () => {
  const promoted = promoteTo3d(image2d())
  assert.equal(promoted.imageType.dimension, 3)
  assert.equal(promoted.imageType.componentType, 'int16')
  assert.equal(promoted.imageType.pixelType, 'Scalar')
  assert.equal(promoted.imageType.components, 1)
  assert.deepEqual(promoted.size, [4, 3, 1])
  assert.deepEqual(promoted.spacing, [0.5, 0.75, 1])
  assert.deepEqual(promoted.origin, [10, -20, 0])
  assert.deepEqual(Array.from(promoted.direction as Float64Array), [1, 0, 0, 0, 1, 0, 0, 0, 1])
  assert.equal(promoted.name, 'slice')
})

test('embeds a non-identity 2x2 direction in the top-left block', () => {
  const promoted = promoteTo3d(image2d([0, 1, -1, 0]))
  assert.deepEqual(Array.from(promoted.direction as Float64Array), [0, 1, 0, -1, 0, 0, 0, 0, 1])
})

test('shares the pixel buffer and copies the metadata map', () => {
  const source = image2d()
  const promoted = promoteTo3d(source)
  assert.equal(promoted.data, source.data)
  assert.notEqual(promoted.metadata, source.metadata)
  assert.deepEqual([...promoted.metadata], [...source.metadata])
})

test('leaves the input image untouched', () => {
  const source = image2d()
  promoteTo3d(source)
  assert.equal(source.imageType.dimension, 2)
  assert.deepEqual(source.size, [4, 3])
  assert.deepEqual(source.spacing, [0.5, 0.75])
  assert.deepEqual(source.origin, [10, -20])
  assert.equal(source.direction.length, 4)
})

test('rejects images that are not 2D', () => {
  const volume: Image = {
    ...image2d(),
    imageType: { dimension: 3, componentType: 'uint8', pixelType: 'Scalar', components: 1 },
    direction: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    size: [2, 2, 2],
  }
  assert.throws(() => promoteTo3d(volume), /expects a 2D image, got 3D/)
})
