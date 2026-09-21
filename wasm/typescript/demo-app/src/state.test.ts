// Unit tests for the state store and its selectors. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from './io/load-image.ts'
import type { RegistrationResult } from './registration/types.ts'
import {
  OUTPUT_KINDS,
  RESULT_NAME,
  canDownload,
  canLoadInputs,
  canRegister,
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
    imageFormat: 'ozx',
    transformFormat: 'ozx-transform',
    writing: { image: false, transform: false },
  })
  assert.equal(hasInputs(store.state), false)
  assert.equal(hasResult(store.state), false)
  assert.equal(canRegister(store.state), false)
  for (const kind of OUTPUT_KINDS) {
    assert.equal(canDownload(store.state, kind), false, kind)
    assert.equal(isWriting(store.state, kind), false, kind)
  }
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

test('panel content follows the inputs and the display toggle', () => {
  const fixed = fakeImage('fixed.mha')
  const moving = fakeImage('moving.mha')
  const store = createStore()
  assert.equal(fixedPanelContent(store.state), undefined)
  assert.equal(movingPanelContent(store.state), undefined)

  store.update(inputsLoaded(fixed, moving))
  assert.deepEqual(fixedPanelContent(store.state), { image: fixed.itkImage, name: 'fixed.mha' })
  assert.deepEqual(movingPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })

  const result = fakeResult()
  store.update(resultReady(result))
  assert.deepEqual(fixedPanelContent(store.state), { image: fixed.itkImage, name: 'fixed.mha' })
  assert.deepEqual(movingPanelContent(store.state), { image: result.image, name: RESULT_NAME })

  store.update({ showResult: false })
  assert.deepEqual(movingPanelContent(store.state), { image: moving.itkImage, name: 'moving.mha' })
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

  store.update(formatChosen('transform', 'elastix-json'))
  assert.equal(store.state.imageFormat, 'nii.gz')
  assert.equal(store.state.transformFormat, 'elastix-json')
  assert.equal(selectedFormatId(store.state, 'transform'), 'elastix-json')

  assert.throws(() => formatChosen('image', 'elastix-json'), /Unknown image format: elastix-json/)
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
