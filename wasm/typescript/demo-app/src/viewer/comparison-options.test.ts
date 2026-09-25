// Unit tests for the comparison viewer decisions. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from '../io/load-image.ts'
import type { RegistrationResult } from '../registration/types.ts'
import { RESULT_NAME, createStore, inputsLoaded, resultReady } from '../state.ts'
import {
  COMPARISON_ROLES,
  COMPARISON_SIDES,
  DEFAULT_COMPARISON_POSITION,
  PANEL_ROLES,
  SIDE_SLOTS,
  panelCaption,
  panelComparison,
  panelContent,
  panelLabel,
  panelRole,
  panelSide,
  panelsOnSide,
} from './comparison-options.ts'

function fakeImage(name: string): LoadedImage {
  return { name, dimension: 2, itkImage: { name } } as unknown as LoadedImage
}

function fakeResult(): RegistrationResult {
  return { image: { name: 'result' } } as unknown as RegistrationResult
}

test('there are two comparisons of two sides each, four panels in layout order', () => {
  assert.deepEqual(COMPARISON_ROLES, ['inputs', 'result'])
  assert.deepEqual(COMPARISON_SIDES, ['fixed', 'moving'])
  assert.deepEqual(PANEL_ROLES, ['inputs-fixed', 'inputs-moving', 'result-fixed', 'result-moving'])
  assert.equal(DEFAULT_COMPARISON_POSITION, 50)
})

test('a panel role names its comparison and side, and round-trips', () => {
  for (const comparison of COMPARISON_ROLES) {
    for (const side of COMPARISON_SIDES) {
      const role = panelRole(comparison, side)
      assert.equal(role, `${comparison}-${side}`)
      assert.equal(panelComparison(role), comparison)
      assert.equal(panelSide(role), side)
    }
  }
  assert.deepEqual(panelsOnSide('fixed'), ['inputs-fixed', 'result-fixed'])
  assert.deepEqual(panelsOnSide('moving'), ['inputs-moving', 'result-moving'])
})

test('the fixed side takes the after slot, which wa-comparison draws on the left', () => {
  assert.deepEqual(SIDE_SLOTS, { fixed: 'after', moving: 'before' })
})

test('panel labels name the side and the comparison', () => {
  assert.equal(panelLabel('inputs-fixed'), 'Fixed (inputs)')
  assert.equal(panelLabel('inputs-moving'), 'Moving (inputs)')
  assert.equal(panelLabel('result-fixed'), 'Fixed (result)')
  assert.equal(panelLabel('result-moving'), 'Moving (result)')
})

test('panel content: the fixed input on both fixed sides, the moving input on the inputs side, the result when shown', () => {
  const fixed = fakeImage('fixed.mha')
  const moving = fakeImage('moving.mha')
  const store = createStore()
  for (const role of PANEL_ROLES) {
    assert.equal(panelContent(store.state, role), undefined, role)
  }

  store.update(inputsLoaded(fixed, moving))
  const fixedContent = { image: fixed.itkImage, name: 'fixed.mha' }
  const movingContent = { image: moving.itkImage, name: 'moving.mha' }
  assert.deepEqual(panelContent(store.state, 'inputs-fixed'), fixedContent)
  assert.deepEqual(panelContent(store.state, 'inputs-moving'), movingContent)
  assert.deepEqual(panelContent(store.state, 'result-fixed'), fixedContent)
  assert.deepEqual(panelContent(store.state, 'result-moving'), movingContent)

  const result = fakeResult()
  store.update(resultReady(result))
  assert.deepEqual(panelContent(store.state, 'inputs-fixed'), fixedContent)
  assert.deepEqual(panelContent(store.state, 'inputs-moving'), movingContent, 'the inputs comparison never changes')
  assert.deepEqual(panelContent(store.state, 'result-fixed'), fixedContent)
  assert.deepEqual(panelContent(store.state, 'result-moving'), { image: result.image, name: RESULT_NAME })

  store.update({ showResult: false })
  assert.deepEqual(panelContent(store.state, 'result-moving'), movingContent)
})

test('captions name the image on each side and mark the registered result', () => {
  const store = createStore()
  assert.deepEqual(panelCaption(store.state, 'inputs-fixed'), { text: 'Fixed', variant: 'neutral' })
  assert.deepEqual(panelCaption(store.state, 'result-moving'), { text: 'Moving', variant: 'brand' })

  store.update(inputsLoaded(fakeImage('a.nii.gz'), fakeImage('b.nii.gz')))
  assert.deepEqual(panelCaption(store.state, 'inputs-fixed'), { text: 'Fixed · a.nii.gz', variant: 'neutral' })
  assert.deepEqual(panelCaption(store.state, 'inputs-moving'), { text: 'Moving · b.nii.gz', variant: 'brand' })
  assert.deepEqual(panelCaption(store.state, 'result-fixed'), { text: 'Fixed · a.nii.gz', variant: 'neutral' })
  assert.deepEqual(panelCaption(store.state, 'result-moving'), { text: 'Moving · b.nii.gz', variant: 'brand' })

  // The switch alone, without a result, changes nothing.
  store.update({ showResult: true })
  assert.deepEqual(panelCaption(store.state, 'result-moving'), { text: 'Moving · b.nii.gz', variant: 'brand' })

  store.update(resultReady(fakeResult()))
  assert.deepEqual(panelCaption(store.state, 'result-moving'), {
    text: 'Registered · on the fixed grid',
    variant: 'success',
  })
  assert.deepEqual(panelCaption(store.state, 'inputs-moving'), { text: 'Moving · b.nii.gz', variant: 'brand' })
  store.update({ showResult: false })
  assert.deepEqual(panelCaption(store.state, 'result-moving'), { text: 'Moving · b.nii.gz', variant: 'brand' })
})
