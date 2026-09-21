// Unit tests for the download buttons' flow, driven with stand-in exporters,
// a recording download function, and a recording shell. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ExportedFile } from '../io/export-types.ts'
import type { RegistrationResult } from '../registration/types.ts'
import { createStore, resultReady } from '../state.ts'
import { createDownloadFlow, type DownloadFlowOptions, type DownloadFlowShell } from './download-flow.ts'
import type { StatusOptions } from './shell.ts'

function fakeResult(): RegistrationResult {
  return {
    image: { name: 'result-image' },
    transform: [{ name: 'composite' }],
    transformParameterObject: [],
    elapsedMs: 1000,
  } as unknown as RegistrationResult
}

function storeWithResult() {
  const store = createStore()
  store.update(resultReady(fakeResult()))
  return store
}

function recordingShell(): DownloadFlowShell & { statuses: StatusOptions[] } {
  const shell = {
    statuses: [] as StatusOptions[],
    setStatus(options: StatusOptions) {
      shell.statuses.push(options)
    },
  }
  return shell
}

interface Recorder {
  options: DownloadFlowOptions
  imageCalls: { image: unknown; filename: string | undefined }[]
  transformCalls: { transform: unknown; filename: string | undefined }[]
  downloads: { bytes: Uint8Array; filename: string }[]
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function recorder({ delayMs = 0, fail = false }: { delayMs?: number; fail?: boolean } = {}): Recorder {
  const recorder: Recorder = {
    imageCalls: [],
    transformCalls: [],
    downloads: [],
    options: {
      async exportImage(image, filename) {
        recorder.imageCalls.push({ image, filename })
        await wait(delayMs)
        if (fail) {
          throw new Error('Could not write: registered.nrrd')
        }
        return { filename: filename ?? 'image.bin', bytes: new Uint8Array(2048) } satisfies ExportedFile
      },
      async exportTransform(transform, filename) {
        recorder.transformCalls.push({ transform, filename })
        await wait(delayMs)
        if (fail) {
          throw new Error('Could not write: transform.h5')
        }
        return { filename: filename ?? 'transform.bin', bytes: new Uint8Array(300) } satisfies ExportedFile
      },
      download(bytes, filename) {
        recorder.downloads.push({ bytes, filename })
      },
    },
  }
  return recorder
}

test('does nothing without a result', async () => {
  const store = createStore()
  const shell = recordingShell()
  const { options, imageCalls, transformCalls, downloads } = recorder()
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()
  await flow.downloadTransform()

  assert.equal(imageCalls.length, 0)
  assert.equal(transformCalls.length, 0)
  assert.equal(downloads.length, 0)
  assert.deepEqual(shell.statuses, [])
})

test('writes the result image as registered.nrrd, downloads it, and reports the size', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, downloads } = recorder()
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()

  assert.deepEqual(imageCalls, [{ image: store.state.result!.image, filename: 'registered.nrrd' }])
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0]!.filename, 'registered.nrrd')
  assert.equal(downloads[0]!.bytes.byteLength, 2048)
  assert.deepEqual(shell.statuses, [
    { message: 'Writing registered.nrrd…', busy: true },
    { message: 'Downloaded registered.nrrd (2.0 KB).' },
  ])
})

test('writes the transform as transform.h5 and downloads it', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, transformCalls, downloads } = recorder()
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadTransform()

  assert.deepEqual(transformCalls, [{ transform: store.state.result!.transform, filename: 'transform.h5' }])
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0]!.filename, 'transform.h5')
  assert.deepEqual(shell.statuses, [
    { message: 'Writing transform.h5…', busy: true },
    { message: 'Downloaded transform.h5 (300 B).' },
  ])
})

test('reports a writer failure in a danger callout and downloads nothing', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, downloads } = recorder({ fail: true })
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()

  assert.equal(downloads.length, 0)
  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'danger')
  assert.equal(last.message, 'Could not write registered.nrrd: Could not write: registered.nrrd')
})

test('ignores a repeated click while the same file is being written, then allows another', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, downloads } = recorder({ delayMs: 20 })
  const flow = createDownloadFlow(store, shell, options)

  const first = flow.downloadImage()
  await flow.downloadImage()
  await first
  assert.equal(imageCalls.length, 1)
  assert.equal(downloads.length, 1)

  await flow.downloadImage()
  assert.equal(imageCalls.length, 2)
  assert.equal(downloads.length, 2)
})

test('lets the image and the transform be written at the same time', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, transformCalls, downloads } = recorder({ delayMs: 20 })
  const flow = createDownloadFlow(store, shell, options)

  await Promise.all([flow.downloadImage(), flow.downloadTransform()])

  assert.equal(imageCalls.length, 1)
  assert.equal(transformCalls.length, 1)
  assert.deepEqual(
    downloads.map((download) => download.filename).sort(),
    ['registered.nrrd', 'transform.h5'],
  )
})
