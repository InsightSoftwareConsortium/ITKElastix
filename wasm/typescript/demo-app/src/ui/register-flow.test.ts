// Unit tests for the registration flow a loaded pair and the Register and
// Cancel buttons start and stop, driven with a stand-in runner and a
// recording shell. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { LoadedImage } from '../io/load-image.ts'
import {
  AFFINE_STAGES_LABEL,
  DEFAULT_NUMBER_OF_RESOLUTIONS,
  type RegisterFunction,
  type RegistrationResult,
} from '../registration/types.ts'
import { abortable } from '../registration/abortable.ts'
import { createStore, inputsLoaded, reloadStarted, resolutionsChosen, resultReady } from '../state.ts'
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
  const { run } = createRegisterFlow(store, shell, {
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
  const received: { fixed: unknown; moving: unknown; resolutions: number | undefined; signal: unknown }[] = []
  const register: RegisterFunction = async (fixed, moving, options, onStatus) => {
    received.push({ fixed, moving, resolutions: options?.numberOfResolutions, signal: options?.signal })
    assert.equal(store.state.registering, true, 'registering while the runner works')
    onStatus?.({ stage: 'parameters', message: 'Building maps…', elapsedMs: 1 })
    await wait(40)
    onStatus?.({ stage: 'register', message: 'Registering…', elapsedMs: 41 })
    await wait(40)
    onStatus?.({ stage: 'done', message: 'Registered', elapsedMs: 81 })
    return fakeResult(4321)
  }
  const { run } = createRegisterFlow(store, shell, { register, tickMs: 5 })

  await run()

  assert.equal(received.length, 1)
  assert.equal(received[0]!.fixed, store.state.fixed!.itkImage)
  assert.equal(received[0]!.moving, store.state.moving!.itkImage)
  assert.equal(received[0]!.resolutions, DEFAULT_NUMBER_OF_RESOLUTIONS, 'the store’s resolutions are passed')
  assert.ok(received[0]!.signal instanceof AbortSignal, 'a signal is passed for Cancel')
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
  const { run } = createRegisterFlow(store, shell, {
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
  const { run } = createRegisterFlow(store, shell, {
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
  const { run } = createRegisterFlow(store, shell, {
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

test('does nothing while a budget reload is replacing the inputs', async () => {
  const store = loadedStore()
  store.update(reloadStarted())
  const shell = recordingShell()
  let calls = 0
  const { run } = createRegisterFlow(store, shell, {
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

test('ignores a second click while a run is active', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  let calls = 0
  const { run } = createRegisterFlow(store, shell, {
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

test('passes the resolutions chosen in the store to the runner', async () => {
  const store = loadedStore()
  store.update(resolutionsChosen(5))
  const shell = recordingShell()
  const seen: (number | undefined)[] = []
  const { run } = createRegisterFlow(store, shell, {
    register: async (_fixed, _moving, options) => {
      seen.push(options?.numberOfResolutions)
      return fakeResult()
    },
  })

  await run()
  assert.deepEqual(seen, [5])
})

test('cancel aborts the run, returns the store to idle, keeps the earlier result, and says so', async () => {
  const store = loadedStore()
  store.update(resultReady(fakeResult(999)))
  const earlier = store.state.result
  const shell = recordingShell()
  let terminated = false
  const { run, cancel } = createRegisterFlow(store, shell, {
    register: (_fixed, _moving, options) =>
      // Like registerAffine: the pipeline promise is abandoned on abort and
      // the worker terminated.
      abortable(new Promise<RegistrationResult>(() => {}), options?.signal).finally(() => {
        terminated = options?.signal?.aborted ?? false
      }),
    tickMs: 5,
  })

  const running = run()
  await wait(15)
  assert.equal(store.state.registering, true)
  cancel()
  await running

  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, earlier, 'the result of the previous run is kept')
  assert.equal(terminated, true)
  const last = shell.statuses.at(-1)!
  assert.match(last.message, /^Registration cancelled after \d+\.\d s\. Press Register to start again\.$/)
  assert.equal(last.variant, undefined)
  assert.equal(last.busy, undefined)
  assert.equal(shell.settledCalls, 0)

  const count = shell.statuses.length
  await wait(30)
  assert.equal(shell.statuses.length, count, 'no ticks after the cancellation')
})

test('cancel does nothing while idle, and a new run after a cancellation gets a fresh signal', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const signals: AbortSignal[] = []
  const { run, cancel } = createRegisterFlow(store, shell, {
    register: async (_fixed, _moving, options) => {
      signals.push(options!.signal!)
      await abortable(wait(20), options?.signal)
      return fakeResult()
    },
  })

  cancel()
  assert.equal(store.state.registering, false)
  assert.deepEqual(shell.statuses, [])

  const first = run()
  cancel()
  await first
  assert.equal(store.state.result, undefined)

  await run()
  assert.equal(signals.length, 2)
  assert.equal(signals[0]!.aborted, true)
  assert.equal(signals[1]!.aborted, false)
  assert.notEqual(store.state.result, undefined, 'the second run completes')
})

test('discards a result the runner still delivers after the run was cancelled', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const { run, cancel } = createRegisterFlow(store, shell, {
    register: async () => {
      // A stand-in that ignores the signal.
      await wait(20)
      return fakeResult()
    },
  })

  const running = run()
  cancel()
  await running

  assert.equal(store.state.registering, false)
  assert.equal(store.state.result, undefined)
  assert.equal(shell.settledCalls, 0)
  assert.equal(shell.statuses.at(-1)!.message, 'Registration cancelled. Press Register to start again.')
})
