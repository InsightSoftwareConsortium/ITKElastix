// Unit tests for the decisions behind the image exporter. Run with
// `pnpm test:unit`; these stay out of test/ so Playwright never picks them up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from './load-image.ts'
import {
  EXPORT_LEVEL_CAP,
  canUseDeflateWorkers,
  exportScaleFactors,
  inPlaneScaleFactors,
  omeTiffPlaneCount,
  registrationOutputs,
  resultAddsAnatomicalOrientation,
  resultFilename,
  toWriterError,
} from './export-plan.ts'
import { imageFormatById } from './formats.ts'
import type { ImageShapeInfo } from './scale-select.ts'

/** The fields of a loaded input the plan reads, as a stand-in `LoadedImage`. */
function loaded(name: string, axesOrientations?: Record<string, unknown>): LoadedImage {
  return { name, ngffImage: { axesOrientations } } as unknown as LoadedImage
}

function shape(dims: string[], extents: number[], dtype = 'int16'): ImageShapeInfo {
  return { dims, data: { shape: extents, dtype } }
}

test('registrationOutputs returns the result with both inputs', () => {
  const fixed = loaded('fixed.mha')
  const moving = loaded('moving.mha')
  const result = { image: {}, transform: [], transformParameterObject: [], elapsedMs: 1 } as never
  assert.deepEqual(registrationOutputs({ fixed, moving, result }), { fixed, moving, result })
})

test('registrationOutputs refuses a state without a result or without its inputs', () => {
  const fixed = loaded('fixed.mha')
  const result = { image: {}, transform: [], transformParameterObject: [], elapsedMs: 1 } as never
  assert.throws(() => registrationOutputs({ fixed, moving: loaded('moving.mha') }), /no registration result/)
  assert.throws(() => registrationOutputs({ fixed, result }), /lost its input images/)
  assert.throws(() => registrationOutputs({ result }), /lost its input images/)
})

test('resultFilename names the file after the result in the format extension', () => {
  assert.equal(resultFilename(imageFormatById('ozx')), 'registered.ome.zarr.ozx')
  assert.equal(resultFilename(imageFormatById('ome-tiff')), 'registered.ome.tif')
  assert.equal(resultFilename(imageFormatById('nrrd')), 'registered.nrrd')
  assert.equal(resultFilename(imageFormatById('nii.gz')), 'registered.nii.gz')
  assert.equal(resultFilename(imageFormatById('iwi.cbor')), 'registered.iwi.cbor')
})

test('resultAddsAnatomicalOrientation never tags a 2D result', () => {
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz'), 2), false)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx', { x: {}, y: {} }), 2), false)
})

test('resultAddsAnatomicalOrientation follows the ingest rule for an ITK source', () => {
  // ingest tagged a 3D NIfTI, so its level carries orientations too; either
  // signal alone is enough.
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.nii.gz'), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('IM0001'), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('stack.png'), 3), false)
})

test('resultAddsAnatomicalOrientation trusts the orientation an OME-Zarr or OME-TIFF source declared', () => {
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.tif', { x: {}, y: {}, z: {} }), 3), true)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.zarr.ozx'), 3), false)
  assert.equal(resultAddsAnatomicalOrientation(loaded('brain.ome.tif'), 3), false)
})

test('exportScaleFactors is empty for an image that fits the budget', () => {
  // 256 x 256 int16 = 128 KiB, the size of the registered CT slice.
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [256, 256]), 128 * 1024), [])
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [256, 256]), 50 * 1024 * 1024), [])
})

test('exportScaleFactors extends the pyramid until a level fits, as ingest does', () => {
  // 1 MiB int16 image, 256 KiB budget: ÷2 gives 256 KiB, which fits.
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [1024, 512]), 256 * 1024), [2])
  assert.deepEqual(exportScaleFactors(shape(['y', 'x'], [1024, 512]), 64 * 1024), [2, 4])
})

test(`exportScaleFactors caps the pyramid at ${EXPORT_LEVEL_CAP} levels`, () => {
  // 32 MiB uint8 volume against a 1 KiB budget would need ÷2 … ÷64.
  const volume = shape(['z', 'y', 'x'], [512, 256, 256], 'uint8')
  assert.deepEqual(exportScaleFactors(volume, 1024), [2, 4, 8])
  assert.equal(exportScaleFactors(volume, 1024).length, EXPORT_LEVEL_CAP - 1)
})

test('inPlaneScaleFactors leaves z alone and skips non-spatial dims', () => {
  assert.deepEqual(inPlaneScaleFactors([2, 4], ['z', 'y', 'x']), [
    { z: 1, y: 2, x: 2 },
    { z: 1, y: 4, x: 4 },
  ])
  assert.deepEqual(inPlaneScaleFactors([2], ['c', 'z', 'y', 'x']), [{ z: 1, y: 2, x: 2 }])
  assert.deepEqual(inPlaneScaleFactors([2], ['y', 'x']), [{ y: 2, x: 2 }])
  assert.deepEqual(inPlaneScaleFactors([], ['z', 'y', 'x']), [])
})

test('omeTiffPlaneCount counts one read per non-XY index per level', () => {
  assert.equal(omeTiffPlaneCount({ images: [shape(['y', 'x'], [256, 256])] }), 1)
  assert.equal(omeTiffPlaneCount({ images: [shape(['y', 'x'], [256, 256]), shape(['y', 'x'], [128, 128])] }), 2)
  // A volume's sub-levels keep the full z extent, so every level reads every plane.
  assert.equal(
    omeTiffPlaneCount({ images: [shape(['z', 'y', 'x'], [5, 8, 8]), shape(['z', 'y', 'x'], [5, 4, 4])] }),
    10,
  )
  assert.equal(omeTiffPlaneCount({ images: [shape(['t', 'c', 'z', 'y', 'x'], [2, 3, 5, 8, 8])] }), 30)
  assert.throws(() => omeTiffPlaneCount({ images: [] }), /empty multiscales/)
})

test('canUseDeflateWorkers follows the SharedArrayBuffer global, which Node always has', () => {
  assert.equal(canUseDeflateWorkers(), typeof SharedArrayBuffer !== 'undefined')
  assert.equal(canUseDeflateWorkers(), true)
})

test('toWriterError keeps an Error and makes an Emscripten exception pointer readable', () => {
  const error = new Error('boom')
  assert.equal(toWriterError(error, 'registered.png'), error)

  const fromNumber = toWriterError(452728, 'registered.png')
  assert.match(fromNumber.message, /registered\.png/)
  assert.match(fromNumber.message, /code 452728/)
  assert.match(fromNumber.message, /pixel type or dimension/)

  assert.equal(toWriterError('nope', 'registered.nrrd').message, 'Could not write registered.nrrd: nope')
})
