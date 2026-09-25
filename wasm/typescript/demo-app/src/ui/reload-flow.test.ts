// Unit tests for the budget picker's reload flow, driven with a stand-in
// loader and a recording shell. Run with `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ImageSource, LoadImageOptions, LoadedImage } from '../io/load-image.ts'
import { createStore, registrationStarted, resultReady, type AppStore } from '../state.ts'
import type { RegistrationResult } from '../registration/types.ts'
import type { Notifier } from './notify.ts'
import { createReloadFlow, type ReloadFlowShell } from './reload-flow.ts'
import type { StatusOptions } from './shell.ts'

const MIB = 1024 * 1024

/** A loaded image with a URL source, as the samples and typed URLs produce. */
function fakeImage(name: string, budgetBytes = 50 * MIB, dimension: 2 | 3 = 2): LoadedImage {
  return {
    name,
    dimension,
    budgetBytes,
    itkImage: { name, imageType: { dimension, components: 1, pixelType: 'Scalar' } },
    source: { url: `/samples/${name}`, name },
  } as unknown as LoadedImage
}

function fakeResult(): RegistrationResult {
  return { image: { name: 'result' }, elapsedMs: 1 } as unknown as RegistrationResult
}

function recordingShell(): ReloadFlowShell & { statuses: StatusOptions[]; warnings: string[]; settledCalls: number } {
  const shell = {
    statuses: [] as StatusOptions[],
    warnings: [] as string[],
    settledCalls: 0,
    setStatus(options: StatusOptions) {
      shell.statuses.push(options)
    },
    // The flow raises warning toasts only.
    notify: {
      warning(message: string) {
        shell.warnings.push(message)
      },
    } as unknown as Notifier,
    async settled() {
      shell.settledCalls += 1
    },
  }
  return shell
}

function loadedStore(): AppStore {
  return createStore({ fixed: fakeImage('fixed.mha'), moving: fakeImage('moving.mha') })
}

interface LoadCall {
  source: ImageSource
  budgetBytes: number | undefined
  /** Whether the store was marked as reloading when the loader was called. */
  reloading: boolean
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test('reloads the fixed then the moving image at the new budget and commits both with the budget', async () => {
  const store = loadedStore()
  store.update(resultReady(fakeResult()))
  const shell = recordingShell()
  const calls: LoadCall[] = []
  let inFlight = 0
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source, options?: LoadImageOptions) {
      inFlight += 1
      assert.equal(inFlight, 1, 'the two loads never overlap')
      calls.push({ source, budgetBytes: options?.budgetBytes, reloading: store.state.reloading })
      options?.onProgress?.({ stage: 'read', message: `Decoding ${(source as { name: string }).name}…` })
      await wait(10)
      inFlight -= 1
      return fakeImage((source as { name: string }).name, options?.budgetBytes)
    },
  })

  assert.equal(await reload(10 * MIB), true)

  assert.deepEqual(
    calls.map((call) => [(call.source as { name: string }).name, call.budgetBytes, call.reloading]),
    [
      ['fixed.mha', 10 * MIB, true],
      ['moving.mha', 10 * MIB, true],
    ],
  )
  assert.equal(store.state.reloading, false)
  assert.equal(store.state.budgetBytes, 10 * MIB)
  assert.equal(store.state.fixed!.budgetBytes, 10 * MIB)
  assert.equal(store.state.moving!.budgetBytes, 10 * MIB)
  assert.equal(store.state.result, undefined, 'the old result belonged to the old pair')
  assert.equal(store.state.showResult, false)
  assert.equal(shell.settledCalls, 1)

  const busy = shell.statuses.filter((status) => status.busy).map((status) => status.message)
  assert.ok(busy.includes('Reloading the fixed image at 10.0 MB…'))
  assert.ok(busy.includes('Fixed: Decoding fixed.mha…'))
  assert.ok(busy.includes('Moving: Decoding moving.mha…'))
  assert.ok(busy.includes('Displaying fixed.mha and moving.mha…'))
  const last = shell.statuses.at(-1)!
  assert.equal(last.message, 'Reloaded fixed.mha (fixed) and moving.mha (moving) at a 10.0 MB budget.')
  assert.equal(last.variant, undefined)
  assert.equal(last.busy, undefined)
})

test('does nothing for the budget already in effect, during a run, or without sources', async () => {
  const shell = recordingShell()
  let calls = 0
  const loadImage = async (source: ImageSource) => {
    calls += 1
    return fakeImage((source as { name: string }).name)
  }

  const same = loadedStore()
  assert.equal(await createReloadFlow(same, shell, { loadImage }).reload(same.state.budgetBytes), false)
  assert.equal(calls, 0)

  const running = loadedStore()
  running.update(registrationStarted())
  assert.equal(await createReloadFlow(running, shell, { loadImage }).reload(10 * MIB), false)
  assert.equal(calls, 0)

  const fromMemory = createStore({
    fixed: { ...fakeImage('fixed.mha'), source: undefined } as LoadedImage,
    moving: fakeImage('moving.mha'),
  })
  assert.equal(await createReloadFlow(fromMemory, shell, { loadImage }).reload(10 * MIB), false)
  assert.equal(calls, 0)
  assert.deepEqual(shell.statuses, [])
})

test('keeps the loaded pair and the budget in effect when a load fails, and reports it', async () => {
  const store = loadedStore()
  store.update(resultReady(fakeResult()))
  const { fixed, moving, result } = store.state
  const shell = recordingShell()
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source) {
      if ((source as { name: string }).name === 'moving.mha') {
        throw new Error('Failed to fetch /samples/moving.mha: 404 Not Found')
      }
      return fakeImage('fixed.mha', 25 * MIB)
    },
  })

  assert.equal(await reload(25 * MIB), false)

  assert.equal(store.state.reloading, false)
  assert.equal(store.state.fixed, fixed)
  assert.equal(store.state.moving, moving)
  assert.equal(store.state.result, result, 'the result still matches the pair on screen')
  assert.equal(store.state.budgetBytes, 50 * MIB)
  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'danger')
  assert.equal(
    last.message,
    'Could not reload the images at 25.0 MB: Failed to fetch /samples/moving.mha: 404 Not Found. The pair loaded at 50.0 MB is kept.',
  )
  assert.equal(shell.settledCalls, 0)
})

test('refuses a reloaded pair that no longer matches, keeping the old one', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source) {
      const name = (source as { name: string }).name
      // The moving image comes back 3D, as if the URL now served a volume.
      return fakeImage(name, 10 * MIB, name === 'moving.mha' ? 3 : 2)
    },
  })

  assert.equal(await reload(10 * MIB), false)

  assert.equal(store.state.reloading, false)
  assert.equal(store.state.budgetBytes, 50 * MIB)
  assert.equal(store.state.fixed!.budgetBytes, 50 * MIB)
  assert.equal(shell.statuses.at(-1)!.variant, 'danger')
  assert.match(shell.statuses.at(-1)!.message, /dimension/)
})

test('discards a reload whose pair was replaced meanwhile, and reports that nothing was reloaded', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const replacement = { fixed: fakeImage('other-fixed.mha'), moving: fakeImage('other-moving.mha') }
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source, options) {
      const name = (source as { name: string }).name
      if (name === 'moving.mha') {
        // A programmatic load lands while the reload is still reading.
        store.update(replacement)
      }
      return fakeImage(name, options?.budgetBytes)
    },
  })

  assert.equal(await reload(10 * MIB), false)

  assert.equal(store.state.reloading, false)
  assert.equal(store.state.fixed, replacement.fixed)
  assert.equal(store.state.moving, replacement.moving)
  assert.equal(store.state.budgetBytes, 50 * MIB)
  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'warning')
  assert.equal(last.message, 'The images changed while reloading, so that reload was discarded.')
  assert.equal(shell.settledCalls, 0)
})

test('ignores a second reload while one is active', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  let calls = 0
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source, options) {
      calls += 1
      await wait(10)
      return fakeImage((source as { name: string }).name, options?.budgetBytes)
    },
  })

  const first = reload(10 * MIB)
  assert.equal(await reload(25 * MIB), false)
  assert.equal(await first, true)
  assert.equal(calls, 2)
  assert.equal(store.state.budgetBytes, 10 * MIB)
})

test('shows a loader warning as a toast while the reload goes on', async () => {
  const store = loadedStore()
  const shell = recordingShell()
  const { reload } = createReloadFlow(store, shell, {
    async loadImage(source, options?: LoadImageOptions) {
      const name = (source as { name: string }).name
      options?.onWarning?.(`${name} is 612.0 MB at full resolution`)
      return fakeImage(name, options?.budgetBytes)
    },
  })

  await reload(10 * MIB)

  assert.deepEqual(shell.warnings, ['fixed.mha is 612.0 MB at full resolution', 'moving.mha is 612.0 MB at full resolution'])
  assert.equal(store.state.budgetBytes, 10 * MIB)
  assert.equal(shell.statuses.at(-1)!.variant, undefined, 'the warning stays out of the status row')
})
