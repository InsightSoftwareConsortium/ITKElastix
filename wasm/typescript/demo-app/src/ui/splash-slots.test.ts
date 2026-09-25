// Unit tests for the splash dialog's slot helpers. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { RegistrationInput } from '../io/normalize.ts'
import { firstUrlFromList, pairError, roleLabel, SLOT_ROLES, swapSlots, urlSource, urlSourceFromText } from './splash-slots.ts'

function input(name: string, dimension: number, components = 1): RegistrationInput {
  return { name, dimension, itkImage: { imageType: { dimension, components, componentType: 'int16', pixelType: 'Scalar' } } }
}

test('names the roles', () => {
  assert.deepEqual(SLOT_ROLES, ['fixed', 'moving'])
  assert.equal(roleLabel('fixed'), 'Fixed')
  assert.equal(roleLabel('moving'), 'Moving')
})

test('derives a source name from a URL and ignores blank text', () => {
  assert.deepEqual(urlSource('/samples/CT_2D_head_fixed.mha'), {
    url: '/samples/CT_2D_head_fixed.mha',
    name: 'CT_2D_head_fixed.mha',
  })
  assert.deepEqual(urlSourceFromText('  https://example.org/data/brain.ome.zarr/  '), {
    url: 'https://example.org/data/brain.ome.zarr/',
    name: 'brain.ome.zarr',
  })
  assert.equal(urlSourceFromText(''), null)
  assert.equal(urlSourceFromText('   \n'), null)
  assert.equal(urlSourceFromText(null), null)
  assert.equal(urlSourceFromText(undefined), null)
})

test('takes the first real URL of a dropped uri-list', () => {
  assert.equal(firstUrlFromList('# comment\r\nhttps://example.org/a.ozx\r\nhttps://example.org/b.ozx'), 'https://example.org/a.ozx')
  assert.equal(firstUrlFromList('  /samples/x.nii.gz  '), '/samples/x.nii.gz')
  assert.equal(firstUrlFromList('just some words'), null)
  assert.equal(firstUrlFromList('\n\n'), null)
  assert.equal(firstUrlFromList('#only-a-comment'), null)
})

test('reports a pair error only when both slots are filled and incompatible', () => {
  assert.equal(pairError(undefined, undefined), null)
  assert.equal(pairError(input('a.mha', 2), undefined), null)
  assert.equal(pairError(undefined, input('b.mha', 3)), null)
  assert.equal(pairError(input('a.mha', 2), input('b.mha', 2)), null)
  const mismatch = pairError(input('a.mha', 2), input('b.nii.gz', 3))
  assert.match(mismatch ?? '', /a\.mha is 2D but the moving image b\.nii\.gz is 3D/)
  assert.match(mismatch ?? '', /same dimension/)
  assert.match(pairError(input('rgb.png', 2, 3), input('b.mha', 2)) ?? '', /3 components/)
})

test('swaps the two slots', () => {
  assert.deepEqual(swapSlots({ fixed: 1, moving: 2 }), { fixed: 2, moving: 1 })
  assert.deepEqual(swapSlots({ fixed: undefined, moving: 'x' }), { fixed: 'x', moving: undefined })
})
