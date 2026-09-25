// Unit tests for the abortable promise wrapper. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { abortable } from './abortable.ts'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test('returns the promise itself without a signal', async () => {
  const promise = Promise.resolve(42)
  assert.equal(abortable(promise), promise)
  assert.equal(await abortable(promise), 42)
})

test('settles like the promise while the signal stays quiet', async () => {
  const controller = new AbortController()
  assert.equal(await abortable(Promise.resolve('ok'), controller.signal), 'ok')
  await assert.rejects(abortable(Promise.reject(new Error('boom')), controller.signal), /boom/)
})

test('rejects with the reason as soon as the signal aborts, without waiting for the promise', async () => {
  const controller = new AbortController()
  let settled = false
  const never = new Promise<string>((resolve) => {
    setTimeout(() => {
      settled = true
      resolve('too late')
    }, 200)
  })
  const wrapped = abortable(never, controller.signal)
  controller.abort(new Error('cancelled by the user'))
  await assert.rejects(wrapped, /cancelled by the user/)
  assert.equal(settled, false, 'the underlying promise was abandoned, not awaited')
})

test('rejects at once for a signal that has already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(abortable(new Promise<void>(() => {}), controller.signal), (reason: unknown) => {
    return reason instanceof Error && reason.name === 'AbortError'
  })
})

test('drops its abort listener once the promise settles', async () => {
  const controller = new AbortController()
  let listeners = 0
  const originalAdd = controller.signal.addEventListener.bind(controller.signal)
  const originalRemove = controller.signal.removeEventListener.bind(controller.signal)
  controller.signal.addEventListener = ((...args: Parameters<typeof originalAdd>) => {
    listeners += 1
    return originalAdd(...args)
  }) as typeof controller.signal.addEventListener
  controller.signal.removeEventListener = ((...args: Parameters<typeof originalRemove>) => {
    listeners -= 1
    return originalRemove(...args)
  }) as typeof controller.signal.removeEventListener

  await abortable(Promise.resolve(1), controller.signal)
  await wait(0)
  assert.equal(listeners, 0)
})
