// Unit tests for the Register button's flow, driven with a stand-in runner
// and a recording shell. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from '../io/load-image.ts'
import { AFFINE_STAGES_LABEL, type RegisterFunction, type RegistrationResult } from '../registration/types.ts'
import { createStore, inputsLoaded } from '../state.ts'
import { createRegisterFlow, type RegisterFlowShell } from './register-flow.ts'
import type { StatusOptions } from './shell.ts'

function fakeImage(name: string): LoadedImage {
  return { name, itkImage: { name } } as unknown as LoadedImage
}

function fakeResult(elapsedMs = 1234): RegistrationResult {
  return { image: { name: 'result' }, transform: [], transformParameterObject: [], elapsedMs } as unknown as RegistrationResult
}

function recordingShell(): RegisterFlowShell & { statuses: StatusOptions[]; settledCalls: number } {
  const shell = {
    statuses: [] as StatusOptions[],
    settledCalls: 0,
    setStatus(options: StatusOptions) {
      shell.statuses.push(options)
    },
    async settled() {
      shell.settledCalls += 1
    },
  }
  return shell
}

function loadedStore() {
  const store = createStore()
  store.update(inputsLoaded(fakeImage('fixed.mha'), fakeImage('moving.mha')))
  return store
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test('does nothing without both inputs', async () => {
  const store = createStore({ fixed: fakeImage('fixed') })
  const shell = recordingShell()
  let calls = 0
  const run = createRegisterFlow(store, shell, {
    register: async () => {
      calls += 1
      return fakeResult()
    },
  })

  await run()
  assert.equal(calls, 0)
  assert.deepEqual(shell.statuses, [])
  assert.equal(store.state.registering, false)
})

test('marks the run, ticks the timer, stores the result, and reports success', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const received: { fixed: unknown; moving: unknown }[] = []
  const register: RegisterFunction = async (fixed, moving, _options, onStatus) => {
    received.push({ fixed, moving })
    assert.equal(store.state.registering, true, 'registering while the runner works')
    onStatus?.({ stage: 'parameters', message: 'Building maps…', elapsedMs: 1 })
    await wait(40)
    onStatus?.({ stage: 'register', message: 'Registering…', elapsedMs: 41 })
    await wait(40)
    onStatus?.({ stage: 'done', message: 'Registered', elapsedMs: 81 })
    return fakeResult(4321)
  }
  const run = createRegisterFlow(store, shell, { register, tickMs: 5 })

  await run()

  assert.deepEqual(received, [{ fixed: store.state.fixed!.itkImage, moving: store.state.moving!.itkImage }])
  assert.equal(store.state.registering, false)
  assert.equal(store.state.result?.elapsedMs, 4321)
  assert.equal(store.state.showResult, true)
  assert.equal(shell.settledCalls, 1)

  const busy = shell.statuses.filter((status) => status.busy)
  assert.ok(busy.length >= 4, `expected several timer ticks, got ${busy.length}`)
  assert.match(busy[0]!.message, new RegExp(`^Registering ${AFFINE_STAGES_LABEL}… \\d+\\.\\d s$`))
  assert.ok(busy.some((status) => status.message.startsWith('Building maps… ')), 'stage messages replace the label')
  assert.ok(busy.some((status) => status.message.startsWith('Registering… ')), 'stage messages replace the label')
  assert.ok(!busy.some((status) => status.message.startsWith('Registered ')), 'the done status is not shown as busy')

  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'success')
  assert.equal(last.busy, undefined)
  assert.match(last.message, /^Registered in 4\.3 s \(translation → rigid → affine\)/)
})

test('stops the timer once the runner settles', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const run = createRegisterFlow(store, shell, {
    register: async () => {
      await wait(20)
      return fakeResult()
    },
    tickMs: 5,
  })

  await run()
  const count = shell.statuses.length
  await wait(40)
  assert.equal(shell.statuses.length, count, 'no ticks after the run finished')
})

test('reports a failure in a danger callout and ends the run', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const run = createRegisterFlow(store, shell, {
    register: async () => {
      await wait(10)
      throw new Error('itk::ExceptionObject: Description: ITK ERROR: elastix failed')
    },
    tickMs: 5,
  })

  await run()

  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, undefined)
  assert.equal(store.state.showResult, false)
  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'danger')
  assert.equal(last.message, 'Registration failed: itk::ExceptionObject: Description: ITK ERROR: elastix failed')
  assert.equal(shell.settledCalls, 0)
})

test('discards a result whose inputs were replaced during the run', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const run = createRegisterFlow(store, shell, {
    register: async () => {
      store.update(inputsLoaded(fakeImage('other-fixed'), fakeImage('other-moving')))
      return fakeResult()
    },
  })

  await run()

  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, undefined)
  assert.equal(shell.statuses.at(-1)!.variant, 'warning')
})

test('ignores a second click while a run is active', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  let calls = 0
  const run = createRegisterFlow(store, shell, {
    register: async () => {
      calls += 1
      await wait(20)
      return fakeResult()
    },
  })

  const first = run()
  await run()
  await first
  assert.equal(calls, 1)
  assert.equal(store.state.result !== undefined, true)
})
