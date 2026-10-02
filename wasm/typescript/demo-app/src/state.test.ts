// Unit tests for the state store and its selectors. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from './io/load-image.ts'
import type { RegistrationResult } from './registration/types.ts'
import { PIXEL_BUDGET_BYTES } from './io/scale-select.ts'
import { DEFAULT_NUMBER_OF_RESOLUTIONS } from './registration/types.ts'
import {
  OUTPUT_KINDS,
  RESULT_NAME,
  budgetApplied,
  canCancelRegistration,
  canDownload,
  canLoadInputs,
  canRegister,
  canReloadInputs,
  createStore,
  fixedPanelContent,
  formatChosen,
  hasInputs,
  hasResult,
  inputsLoaded,
  isShowingResult,
  isWriting,
  movingPanelContent,
  registrationFailed,
  registrationStarted,
  reloadFailed,
  reloadStarted,
  resolutionsChosen,
  resultPanelContent,
  resultReady,
  selectedFormatId,
  writingFinished,
  writingStarted,
} from './state.ts'

// The selectors only touch `name`, `itkImage`, and `image`, so stand-ins
// with those fields are enough; the casts keep the tests free of itk-wasm.
function fakeImage(name: string): LoadedImage {
  return { name, itkImage: { name } } as unknown as LoadedImage
}

function fakeResult(): RegistrationResult {
  return { image: { name: 'result' }, elapsedMs: 1 } as unknown as RegistrationResult
}

test('starts empty with the result hidden, the OME-Zarr formats chosen, and nothing being written', () => {
  const store = createStore()
  assert.deepEqual(store.state, {
    showResult: false,
    registering: false,
    reloading: false,
    numberOfResolutions: DEFAULT_NUMBER_OF_RESOLUTIONS,
    budgetBytes: PIXEL_BUDGET_BYTES,
    imageFormat: 'ozx',
    transformFormat: 'ozx-transform',
    writing: { image: false, transform: false },
  })
  assert.equal(hasInputs(store.state), false)
  assert.equal(hasResult(store.state), false)
  assert.equal(canRegister(store.state), false)
  assert.equal(canCancelRegistration(store.state), false)
  assert.equal(canReloadInputs(store.state), false)
  for (const kind of OUTPUT_KINDS) {
    assert.equal(canDownload(store.state, kind), false, kind)
    assert.equal(isWriting(store.state, kind), false, kind)
  }
})

test('resolutionsChosen clamps the picker value to 2..5 and falls back to the default', () => {
  const store = createStore()
  store.update(resolutionsChosen('5'))
  assert.equal(store.state.numberOfResolutions, 5)
  store.update(resolutionsChosen(1))
  assert.equal(store.state.numberOfResolutions, 2)
  store.update(resolutionsChosen(null))
  assert.equal(store.state.numberOfResolutions, DEFAULT_NUMBER_OF_RESOLUTIONS)
})

test('a run can be cancelled only while it is active', () => {
  const store = createStore({ fixed: fakeImage('a'), moving: fakeImage('b') })
  assert.equal(canCancelRegistration(store.state), false)
  store.update(registrationStarted())
  assert.equal(canCancelRegistration(store.state), true)
  store.update(registrationFailed())
  assert.equal(canCancelRegistration(store.state), false)
})

test('the inputs can be reloaded only when both remember a source and nothing is using them', () => {
  const withSource = (name: string) => ({ ...fakeImage(name), source: { url: `/${name}`, name } }) as LoadedImage
  const store = createStore({ fixed: withSource('a'), moving: fakeImage('b') })
  assert.equal(canReloadInputs(store.state), false, 'the moving image has no source')
  store.update({ moving: withSource('b') })
  assert.equal(canReloadInputs(store.state), true)
  store.update(registrationStarted())
  assert.equal(canReloadInputs(store.state), false, 'not during a run')
  store.update(registrationFailed())
  store.update(reloadStarted())
  assert.equal(canReloadInputs(store.state), false, 'not during a reload')
  assert.equal(canRegister(store.state), false, 'a reload blocks Register')
  assert.equal(canLoadInputs(store.state), false, 'a reload blocks Load images')
  store.update(reloadFailed())
  assert.equal(canReloadInputs(store.state), true)
  assert.equal(canRegister(store.state), true)
  assert.equal(canLoadInputs(store.state), true)
})

test('budgetApplied commits the reloaded pair and the budget together, dropping the result and ending the reload', () => {
  const store = createStore({
    fixed: fakeImage('a'),
    moving: fakeImage('b'),
    result: fakeResult(),
    showResult: true,
    reloading: true,
  })
  const fixed = fakeImage('a-again')
  const moving = fakeImage('b-again')
  store.update(budgetApplied(fixed, moving, 10 * 1024 * 1024))
  assert.equal(store.state.fixed, fixed)
  assert.equal(store.state.moving, moving)
  assert.equal(store.state.budgetBytes, 10 * 1024 * 1024)
  assert.equal(store.state.reloading, false)
  assert.equal(store.state.result, undefined)
  assert.equal(store.state.showResult, false)
})

test('accepts initial values', () => {
  const fixed = fakeImage('fixed')
  const store = createStore({ fixed })
  assert.equal(store.state.fixed, fixed)
  assert.equal(store.state.showResult, false)
})

test('update merges an object patch and notifies with new and previous state', () => {
  const store = createStore()
  const calls: Array<[boolean, boolean]> = []
  store.subscribe((state, previous) => calls.push([state.showResult, previous.showResult]))
  const before = store.state
  const after = store.update({ showResult: true })
  assert.equal(after, store.state)
  assert.notEqual(after, before)
  assert.equal(before.showResult, false)
  assert.deepEqual(calls, [[true, false]])
})

test('update accepts a function of the current state', () => {
  const store = createStore()
  store.update((state) => ({ showResult: !state.showResult }))
  assert.equal(store.state.showResult, true)
})

test('unsubscribe stops notifications, even when called during a notification', () => {
  const store = createStore()
  let first = 0
  let second = 0
  const stopFirst = store.subscribe(() => {
    first += 1
    stopFirst()
  })
  store.subscribe(() => {
    second += 1
  })
  store.update({ showResult: true })
  store.update({ showResult: false })
  assert.equal(first, 1)
  assert.equal(second, 2)
})

test('inputsLoaded replaces the inputs and discards a stale result', () => {
  const store = createStore({ fixed: fakeImage('a'), moving: fakeImage('b'), result: fakeResult(), showResult: true })
  const fixed = fakeImage('fixed')
  const moving = fakeImage('moving')
  store.update(inputsLoaded(fixed, moving))
  assert.equal(store.state.fixed, fixed)
  assert.equal(store.state.moving, moving)
  assert.equal(store.state.result, undefined)
  assert.equal(store.state.showResult, false)
  assert.equal(hasInputs(store.state), true)
  assert.equal(canRegister(store.state), true)
})

test('resultReady stores the result and selects it for display', () => {
  const store = createStore({ fixed: fakeImage('fixed'), moving: fakeImage('moving') })
  const result = fakeResult()
  store.update(resultReady(result))
  assert.equal(store.state.result, result)
  assert.equal(hasResult(store.state), true)
  assert.equal(isShowingResult(store.state), true)
})

test('isShowingResult is false without a result even when the toggle is on', () => {
  const store = createStore({ showResult: true })
  assert.equal(isShowingResult(store.state), false)
})

test('panel content follows the inputs; only the result side follows the result switch', () => {
  const fixed = fakeImage('fixed.mha')
  const moving = fakeImage('moving.mha')
  const store = createStore()
  assert.equal(fixedPanelContent(store.state), undefined)
  assert.equal(movingPanelContent(store.state), undefined)
  assert.equal(resultPanelContent(store.state), undefined)

  store.update(inputsLoaded(fixed, moving))
  assert.deepEqual(fixedPanelContent(store.state), { image: fixed.itkImage, name: 'fixed.mha' })
  assert.deepEqual(movingPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })
  assert.deepEqual(resultPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })

  const result = fakeResult()
  store.update(resultReady(result))
  assert.deepEqual(fixedPanelContent(store.state), { image: fixed.itkImage, name: 'fixed.mha' })
  assert.deepEqual(movingPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })
  assert.deepEqual(resultPanelContent(store.state), { image: result.image, name: RESULT_NAME })

  store.update({ showResult: false })
  assert.deepEqual(resultPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })
})

test('registrationStarted blocks another run and input changes', () => {
  const store = createStore({ fixed: fakeImage('fixed'), moving: fakeImage('moving') })
  assert.equal(canRegister(store.state), true)
  assert.equal(canLoadInputs(store.state), true)

  store.update(registrationStarted())
  assert.equal(store.state.registering, true)
  assert.equal(canRegister(store.state), false)
  assert.equal(canLoadInputs(store.state), false)
})

test('resultReady ends the run, stores the result, and shows it', () => {
  const store = createStore({ fixed: fakeImage('fixed'), moving: fakeImage('moving') })
  store.update(registrationStarted())
  const result = fakeResult()

  store.update(resultReady(result))
  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, result)
  assert.equal(isShowingResult(store.state), true)
  assert.equal(canRegister(store.state), true)
})

test('registrationFailed ends the run and keeps an earlier result', () => {
  const earlier = fakeResult()
  const store = createStore({ fixed: fakeImage('fixed'), moving: fakeImage('moving'), result: earlier })
  store.update(registrationStarted())

  store.update(registrationFailed())
  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, earlier)
  assert.equal(canRegister(store.state), true)
})

test('formatChosen changes one picker at a time and refuses ids the registry lacks for that kind', () => {
  const store = createStore()
  assert.equal(selectedFormatId(store.state, 'image'), 'ozx')
  assert.equal(selectedFormatId(store.state, 'transform'), 'ozx-transform')

  store.update(formatChosen('image', 'nii.gz'))
  assert.equal(store.state.imageFormat, 'nii.gz')
  assert.equal(store.state.transformFormat, 'ozx-transform')
  assert.equal(selectedFormatId(store.state, 'image'), 'nii.gz')

  store.update(formatChosen('transform', 'elastix-toml'))
  assert.equal(store.state.imageFormat, 'nii.gz')
  assert.equal(store.state.transformFormat, 'elastix-toml')
  assert.equal(selectedFormatId(store.state, 'transform'), 'elastix-toml')

  assert.throws(() => formatChosen('image', 'elastix-toml'), /Unknown image format: elastix-toml/)
  assert.throws(() => formatChosen('transform', 'nrrd'), /Unknown transform format: nrrd/)
  assert.throws(() => formatChosen('image', ''), /Unknown image format: /)
})

test('writingStarted and writingFinished toggle one output and canDownload follows the result and the flag', () => {
  const store = createStore()
  store.update(writingStarted('image'))
  assert.deepEqual(store.state.writing, { image: true, transform: false })
  assert.equal(isWriting(store.state, 'image'), true)
  assert.equal(isWriting(store.state, 'transform'), false)
  // Without a result nothing can be downloaded, written or not.
  assert.equal(canDownload(store.state, 'image'), false)
  assert.equal(canDownload(store.state, 'transform'), false)

  store.update(resultReady(fakeResult()))
  assert.equal(canDownload(store.state, 'image'), false, 'the image is still being written')
  assert.equal(canDownload(store.state, 'transform'), true)

  store.update(writingStarted('transform'))
  assert.deepEqual(store.state.writing, { image: true, transform: true })
  store.update(writingFinished('image'))
  assert.deepEqual(store.state.writing, { image: false, transform: true })
  assert.equal(canDownload(store.state, 'image'), true)
  assert.equal(canDownload(store.state, 'transform'), false)
  store.update(writingFinished('transform'))
  assert.deepEqual(store.state.writing, { image: false, transform: false })

  // A new pair drops the result but leaves a write in progress alone.
  store.update(writingStarted('image'))
  store.update(inputsLoaded(fakeImage('fixed'), fakeImage('moving')))
  assert.equal(hasResult(store.state), false)
  assert.equal(isWriting(store.state, 'image'), true)
})

test('a listener that throws is reported and does not stop the others', () => {
  const errors: unknown[] = []
  const store = createStore({}, { onError: (error) => errors.push(error) })
  const seen: boolean[] = []
  store.subscribe(() => {
    throw new Error('render failed')
  })
  store.subscribe((state) => {
    seen.push(state.showResult)
  })

  const state = store.update({ showResult: true })

  assert.equal(state.showResult, true)
  assert.deepEqual(seen, [true], 'the second listener still ran')
  assert.equal(errors.length, 1)
  assert.equal((errors[0] as Error).message, 'render failed')
})
