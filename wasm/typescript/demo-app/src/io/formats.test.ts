// Unit tests for the output format registry. Run with `pnpm test:unit`;
// these stay out of test/ so Playwright never picks them up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_TRANSFORM_FORMAT,
  IMAGE_FORMATS,
  TRANSFORM_FORMATS,
  imageFormatById,
  isImageFormatId,
  isTransformFormatId,
  outputFilename,
  stripImageExtension,
  transformFormatById,
} from './formats.ts'

test('IMAGE_FORMATS lists OZX first, OME-TIFF second, then the ITK-Wasm formats', () => {
  assert.deepEqual(
    IMAGE_FORMATS.map((format) => format.id),
    [
      'ozx',
      'ome-tiff',
      'nrrd',
      'nii',
      'nii.gz',
      'mha',
      'vtk',
      'hdf5',
      'mgh',
      'mnc',
      'mrc',
      'gipl',
      'pic',
      'aim',
      'fdf',
      'bmp',
      'jpg',
      'png',
      'iwi.cbor',
    ],
  )
  assert.deepEqual(IMAGE_FORMATS[0], {
    id: 'ozx',
    label: 'OME-Zarr (.ome.zarr.ozx)',
    extension: '.ome.zarr.ozx',
    kind: 'ozx',
  })
  assert.deepEqual(IMAGE_FORMATS[1], { id: 'ome-tiff', label: 'OME-TIFF (.ome.tif)', extension: '.ome.tif', kind: 'ome-tiff' })
})

test('every ITK image format is keyed by the extension the itk-wasm writer selects on', () => {
  for (const format of IMAGE_FORMATS.slice(2)) {
    assert.equal(format.kind, 'itk', format.id)
    assert.equal(format.extension, `.${format.id}`, format.id)
    assert.match(format.label, /\(\.[a-z0-9.]+\)$/, format.id)
  }
})

test('TRANSFORM_FORMATS lists the RFC-5 OZX first, the ITK-Wasm formats, then elastix JSON', () => {
  assert.deepEqual(
    TRANSFORM_FORMATS.map((format) => format.id),
    ['ozx-transform', 'h5', 'hdf5', 'tfm', 'txt', 'mat', 'xfm', 'iwt.cbor', 'elastix-json'],
  )
  assert.deepEqual(TRANSFORM_FORMATS[0], {
    id: 'ozx-transform',
    label: 'OME-Zarr transform (.ome.zarr.ozx)',
    extension: '.ome.zarr.ozx',
    kind: 'ozx',
  })
  assert.deepEqual(TRANSFORM_FORMATS.at(-1), {
    id: 'elastix-json',
    label: 'elastix TransformParameters (.json)',
    extension: '.json',
    kind: 'json',
  })
  for (const format of TRANSFORM_FORMATS.slice(1, -1)) {
    assert.equal(format.kind, 'itk', format.id)
    assert.equal(format.extension, `.${format.id}`, format.id)
  }
})

test('format ids are unique and every extension starts with a dot', () => {
  for (const formats of [IMAGE_FORMATS, TRANSFORM_FORMATS]) {
    const ids = formats.map((format) => format.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const format of formats) {
      assert.ok(format.extension.startsWith('.'), format.id)
      assert.ok(format.label.includes(format.extension), format.id)
    }
  }
})

test('the defaults are the first entries: OZX for the image and the RFC-5 OZX for the transform', () => {
  assert.equal(DEFAULT_IMAGE_FORMAT.id, 'ozx')
  assert.equal(DEFAULT_TRANSFORM_FORMAT.id, 'ozx-transform')
  assert.equal(DEFAULT_IMAGE_FORMAT, IMAGE_FORMATS[0])
  assert.equal(DEFAULT_TRANSFORM_FORMAT, TRANSFORM_FORMATS[0])
})

test('formats are looked up by id and unknown ids throw', () => {
  assert.equal(imageFormatById('nii.gz').extension, '.nii.gz')
  assert.equal(transformFormatById('tfm').kind, 'itk')
  assert.throws(() => imageFormatById('ozx-transform'), /Unknown image format: ozx-transform/)
  assert.throws(() => transformFormatById('nrrd'), /Unknown transform format: nrrd/)
  assert.equal(isImageFormatId('png'), true)
  assert.equal(isImageFormatId('elastix-json'), false)
  assert.equal(isTransformFormatId('elastix-json'), true)
  assert.equal(isTransformFormatId('png'), false)
})

test('stripImageExtension removes one compound extension, else one single extension', () => {
  assert.equal(stripImageExtension('brain.nii.gz'), 'brain')
  assert.equal(stripImageExtension('brain.ome.zarr.ozx'), 'brain')
  assert.equal(stripImageExtension('brain.ome.zarr'), 'brain')
  assert.equal(stripImageExtension('slide.ome.tif'), 'slide')
  assert.equal(stripImageExtension('slide.OME.TIFF'), 'slide')
  assert.equal(stripImageExtension('x.gipl.gz'), 'x')
  assert.equal(stripImageExtension('x.mnc.gz'), 'x')
  assert.equal(stripImageExtension('x.mgh.gz'), 'x')
  assert.equal(stripImageExtension('x.iwi.cbor.zst'), 'x')
  assert.equal(stripImageExtension('x.iwi.cbor'), 'x')
  assert.equal(stripImageExtension('t.iwt.cbor.zst'), 't')
  assert.equal(stripImageExtension('t.iwt.cbor'), 't')
  assert.equal(stripImageExtension('CT_2D_head_fixed.mha'), 'CT_2D_head_fixed')
  // Only one extension comes off: a dotted stem keeps its dots.
  assert.equal(stripImageExtension('v1.2.nii.gz'), 'v1.2')
  assert.equal(stripImageExtension('a.b.nrrd'), 'a.b')
  // Nothing to strip.
  assert.equal(stripImageExtension('registered'), 'registered')
  assert.equal(stripImageExtension('.hidden'), '.hidden')
  assert.equal(stripImageExtension(''), '')
})

test('outputFilename replaces the input extension with the format extension', () => {
  const ozx = imageFormatById('ozx')
  assert.equal(outputFilename('registered', imageFormatById('nrrd')), 'registered.nrrd')
  assert.equal(outputFilename('registered', ozx), 'registered.ome.zarr.ozx')
  assert.equal(outputFilename('CT_2D_head_fixed.mha', ozx), 'CT_2D_head_fixed.ome.zarr.ozx')
  assert.equal(outputFilename('brain.nii.gz', imageFormatById('ome-tiff')), 'brain.ome.tif')
  assert.equal(outputFilename('brain.ome.zarr.ozx', imageFormatById('nii.gz')), 'brain.nii.gz')
  assert.equal(outputFilename('slide.OME.TIFF', imageFormatById('png')), 'slide.png')
  assert.equal(outputFilename('x.iwi.cbor.zst', imageFormatById('iwi.cbor')), 'x.iwi.cbor')
  assert.equal(outputFilename('transform', transformFormatById('ozx-transform')), 'transform.ome.zarr.ozx')
  assert.equal(outputFilename('transform.h5', transformFormatById('elastix-json')), 'transform.json')
  assert.equal(outputFilename('transform.iwt.cbor', transformFormatById('tfm')), 'transform.tfm')
})
