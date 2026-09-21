// Unit tests for the pure source-kind detection helpers. Run with
// `pnpm test:unit`; these stay out of test/ so Playwright never picks them up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  detectSourceKind,
  isOmeZarrUrl,
  isTiffFilename,
  nameFromUrl,
  sourceFormatForKind,
  urlPathname,
} from './source-kind.ts'

test('nameFromUrl takes the last path segment without query, fragment, or trailing slash', () => {
  assert.equal(nameFromUrl('/samples/CT_2D_head_fixed.mha'), 'CT_2D_head_fixed.mha')
  assert.equal(nameFromUrl('https://host/a/b/image.nii.gz?token=1#x'), 'image.nii.gz')
  assert.equal(nameFromUrl('https://host/data/brain.ome.zarr/'), 'brain.ome.zarr')
  assert.equal(nameFromUrl('https://host/a%20b.mha'), 'a b.mha')
  assert.equal(nameFromUrl('https://host/'), 'image')
  assert.equal(nameFromUrl('https://host'), 'image')
  assert.equal(nameFromUrl('samples/x.nrrd'), 'x.nrrd')
  // A malformed escape is kept verbatim rather than throwing.
  assert.equal(nameFromUrl('https://host/bad%zz.mha'), 'bad%zz.mha')
})

test('urlPathname lower-cases and strips query, fragment, and trailing slashes', () => {
  assert.equal(urlPathname('https://Host/Data/Brain.OME.ZARR/?x=1#f'), '/data/brain.ome.zarr')
  assert.equal(urlPathname('samples/CT_2D_head_fixed.mha'), '/samples/ct_2d_head_fixed.mha')
  assert.equal(urlPathname('/samples/image.tif?download'), '/samples/image.tif')
})

test('isTiffFilename recognises TIFF and OME-TIFF extensions case-insensitively', () => {
  for (const name of ['a.tif', 'a.tiff', 'a.ome.tif', 'a.ome.tiff', 'A.TIFF', 'dir/x.Ome.Tif']) {
    assert.equal(isTiffFilename(name), true, name)
  }
  for (const name of ['a.tif.gz', 'a.nii.gz', 'tiff', 'a.mha']) {
    assert.equal(isTiffFilename(name), false, name)
  }
})

test('isOmeZarrUrl matches .ome.zarr and .zarr directory URLs', () => {
  assert.equal(isOmeZarrUrl('https://host/data/brain.ome.zarr'), true)
  assert.equal(isOmeZarrUrl('https://host/data/brain.ome.zarr/'), true)
  assert.equal(isOmeZarrUrl('https://host/data/brain.zarr?x=1'), true)
  assert.equal(isOmeZarrUrl('https://host/data/brain.ome.zarr.ozx'), false)
  assert.equal(isOmeZarrUrl('https://host/data/brain.nii.gz'), false)
})

test('detectSourceKind routes OZX by name or URL', () => {
  assert.equal(detectSourceKind('brain.ozx'), 'ozx')
  assert.equal(detectSourceKind('brain.ome.zarr.ozx'), 'ozx')
  assert.equal(detectSourceKind('BRAIN.OME.ZARR.OZX'), 'ozx')
  assert.equal(detectSourceKind('brain.ome.zarr.ozx', 'https://host/brain.ome.zarr.ozx?sig=1'), 'ozx')
  // A URL-derived name that lost its extension still routes by the URL path.
  assert.equal(detectSourceKind('image', 'https://host/x/brain.ozx'), 'ozx')
})

test('detectSourceKind routes OME-Zarr directory stores only by URL path', () => {
  assert.equal(detectSourceKind('brain.ome.zarr', 'https://host/data/brain.ome.zarr'), 'ome-zarr-url')
  assert.equal(detectSourceKind('brain.ome.zarr', 'https://host/data/brain.ome.zarr/'), 'ome-zarr-url')
  assert.equal(detectSourceKind('image', 'https://host/data/brain.zarr'), 'ome-zarr-url')
  assert.equal(detectSourceKind('brain.zarr'), 'ome-zarr-url')
  // The URL path wins over the name when both are given.
  assert.equal(detectSourceKind('brain.zarr', 'https://host/data/brain.nii.gz'), 'itk')
})

test('detectSourceKind routes TIFF and OME-TIFF', () => {
  assert.equal(detectSourceKind('slide.tif'), 'tiff')
  assert.equal(detectSourceKind('slide.ome.tiff'), 'tiff')
  assert.equal(detectSourceKind('slide.ome.tiff', 'https://host/slide.ome.tiff'), 'tiff')
  assert.equal(detectSourceKind('image', 'https://host/x/slide.tiff?raw=true'), 'tiff')
})

test('detectSourceKind leaves everything else to ITK-Wasm', () => {
  for (const name of ['a.mha', 'a.nii.gz', 'a.nrrd', 'a.png', 'a.dcm', 'noextension', 'a.zip']) {
    assert.equal(detectSourceKind(name), 'itk', name)
  }
  assert.equal(detectSourceKind('CT_2D_head_fixed.mha', '/samples/CT_2D_head_fixed.mha'), 'itk')
  assert.equal(detectSourceKind('a.nii.gz', 'https://host/tpl.nii.gz?x=1.tif'), 'itk')
})

test('sourceFormatForKind labels each kind as the format shown to the user', () => {
  assert.equal(sourceFormatForKind('itk'), 'ITK')
  assert.equal(sourceFormatForKind('ozx'), 'OZX')
  assert.equal(sourceFormatForKind('ome-zarr-url'), 'OME-Zarr')
  // The tiff head refines this to 'OME-TIFF' once it has seen the OME-XML.
  assert.equal(sourceFormatForKind('tiff'), 'TIFF')
})
