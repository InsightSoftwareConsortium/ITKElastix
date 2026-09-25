// Unit tests for the download buttons' flow, driven with stand-in exporters,
// a recording download function, and a recording shell. Run with
// `pnpm test:unit`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ExportedFile, ExportProgress, ExportProgressCallback } from '../io/export-types.ts'
import type { RegistrationResult } from '../registration/types.ts'
import { createStore, formatChosen, inputsLoaded, resultReady, type AppStore } from '../state.ts'
import type { LoadedImage } from '../io/load-image.ts'
import {
  createDownloadFlow,
  exportStatus,
  plannedFilename,
  type DownloadFlowOptions,
  type DownloadFlowShell,
} from './download-flow.ts'
import type { StatusOptions } from './shell.ts'

function fakeImage(name: string): LoadedImage {
  return { name, itkImage: { name } } as unknown as LoadedImage
}

function fakeResult(): RegistrationResult {
  return {
    image: { name: 'result-image' },
    transform: [{ name: 'composite' }],
    transformParameterObject: [],
    elapsedMs: 1000,
  } as unknown as RegistrationResult
}

function storeWithResult(): AppStore {
  const store = createStore()
  store.update(inputsLoaded(fakeImage('fixed.mha'), fakeImage('moving.mha')))
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

interface ExportCall {
  /** The state the exporter was handed, by identity. */
  state: unknown
  formatId: string
  /** Whether the store marked this output as being written at the time. */
  writing: boolean
}

interface Recorder {
  options: DownloadFlowOptions
  imageCalls: ExportCall[]
  transformCalls: ExportCall[]
  downloads: { bytes: Uint8Array; filename: string }[]
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** File name the app's exporters give a format id, for the stand-ins. */
function fakeFilename(stem: string, formatId: string): string {
  return formatId.startsWith('ozx') ? `${stem}.ome.zarr.ozx` : `${stem}.${formatId}`
}

function recorder(
  store: AppStore,
  {
    delayMs = 0,
    fail = false,
    progress = [] as ExportProgress[],
  }: { delayMs?: number; fail?: boolean; progress?: ExportProgress[] } = {},
): Recorder {
  async function run(
    calls: ExportCall[],
    kind: 'image' | 'transform',
    state: unknown,
    formatId: string,
    onProgress: ExportProgressCallback | undefined,
    bytes: number,
  ): Promise<ExportedFile> {
    calls.push({ state, formatId, writing: store.state.writing[kind] })
    await wait(delayMs)
    for (const report of progress) {
      onProgress?.(report)
    }
    const filename = fakeFilename(kind === 'image' ? 'registered' : 'transform', formatId)
    if (fail) {
      throw new Error(`The ITK-Wasm writer for ${filename} stopped with an unhandled internal exception (code 7).`)
    }
    return { filename, bytes: new Uint8Array(bytes) }
  }
  const recorder: Recorder = {
    imageCalls: [],
    transformCalls: [],
    downloads: [],
    options: {
      exportImage: (state, formatId, onProgress) =>
        run(recorder.imageCalls, 'image', state, formatId, onProgress, 2048),
      exportTransform: (state, formatId, onProgress) =>
        run(recorder.transformCalls, 'transform', state, formatId, onProgress, 300),
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
  const { options, imageCalls, transformCalls, downloads } = recorder(store)
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()
  await flow.downloadTransform()

  assert.equal(imageCalls.length, 0)
  assert.equal(transformCalls.length, 0)
  assert.equal(downloads.length, 0)
  assert.deepEqual(shell.statuses, [])
  assert.deepEqual(store.state.writing, { image: false, transform: false })
})

test('writes the image in the chosen format (OME-Zarr by default), marks it as being written, downloads it, and reports the size', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, downloads } = recorder(store)
  const flow = createDownloadFlow(store, shell, options)
  const stateAtClick = store.state

  await flow.downloadImage()

  assert.deepEqual(imageCalls, [{ state: stateAtClick, formatId: 'ozx', writing: true }])
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0]!.filename, 'registered.ome.zarr.ozx')
  assert.equal(downloads[0]!.bytes.byteLength, 2048)
  assert.deepEqual(shell.statuses, [
    { message: 'Writing registered.ome.zarr.ozx…', busy: true },
    { message: 'Downloaded registered.ome.zarr.ozx (2.0 KB).' },
  ])
  assert.deepEqual(store.state.writing, { image: false, transform: false })
})

test('writes the transform in the chosen format and downloads it', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, transformCalls, downloads } = recorder(store)
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadTransform()
  assert.deepEqual(transformCalls.map((call) => call.formatId), ['ozx-transform'])
  assert.equal(downloads[0]!.filename, 'transform.ome.zarr.ozx')
  assert.deepEqual(shell.statuses, [
    { message: 'Writing transform.ome.zarr.ozx…', busy: true },
    { message: 'Downloaded transform.ome.zarr.ozx (300 B).' },
  ])

  store.update(formatChosen('transform', 'h5'))
  await flow.download('transform')
  assert.deepEqual(transformCalls.map((call) => call.formatId), ['ozx-transform', 'h5'])
  assert.equal(downloads[1]!.filename, 'transform.h5')
  assert.equal(shell.statuses.at(-2)!.message, 'Writing transform.h5…')
  assert.equal(shell.statuses.at(-1)!.message, 'Downloaded transform.h5 (300 B).')
})

test('drives the status row from the exporter’s progress, with counts only while packaging', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options } = recorder(store, {
    progress: [
      { stage: 'convert', message: 'Converting the registered image to OME-Zarr…' },
      { stage: 'downsample', message: 'Writing the registered image at full resolution only' },
      { stage: 'package', message: 'Writing OME-Zarr…', completed: 0, total: 0 },
      { stage: 'package', message: 'Writing OME-Zarr chunk 1 of 4…', completed: 1, total: 4 },
      { stage: 'package', message: 'Writing OME-Zarr chunk 4 of 4…', completed: 4, total: 4 },
      { stage: 'done', message: 'Wrote registered.ome.zarr.ozx (2.0 KB)' },
    ],
  })
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()

  assert.deepEqual(shell.statuses, [
    { message: 'Writing registered.ome.zarr.ozx…', busy: true },
    { message: 'Converting the registered image to OME-Zarr…', busy: true },
    { message: 'Writing the registered image at full resolution only', busy: true },
    { message: 'Writing OME-Zarr…', busy: true },
    { message: 'Writing OME-Zarr chunk 1 of 4…', busy: true, progress: { completed: 1, total: 4 } },
    { message: 'Writing OME-Zarr chunk 4 of 4…', busy: true, progress: { completed: 4, total: 4 } },
    { message: 'Downloaded registered.ome.zarr.ozx (2.0 KB).' },
  ])
})

test('reports a writer failure in a danger callout, downloads nothing, and leaves the button usable', async () => {
  const store = storeWithResult()
  store.update(formatChosen('image', 'png'))
  const shell = recordingShell()
  const { options, downloads } = recorder(store, { fail: true })
  const flow = createDownloadFlow(store, shell, options)

  await flow.downloadImage()

  assert.equal(downloads.length, 0)
  const last = shell.statuses.at(-1)!
  assert.equal(last.variant, 'danger')
  assert.equal(last.busy, undefined)
  assert.equal(
    last.message,
    'Could not write registered.png: The ITK-Wasm writer for registered.png stopped with an unhandled internal exception (code 7).',
  )
  assert.deepEqual(store.state.writing, { image: false, transform: false })

  // The next click goes through again.
  const { options: working, downloads: later } = recorder(store)
  await createDownloadFlow(store, shell, working).downloadImage()
  assert.equal(later.length, 1)
  assert.equal(later[0]!.filename, 'registered.png')
})

test('ignores a repeated click while the same output is being written, then allows another', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, downloads } = recorder(store, { delayMs: 20 })
  const flow = createDownloadFlow(store, shell, options)

  const first = flow.downloadImage()
  assert.equal(store.state.writing.image, true)
  await flow.downloadImage()
  await first
  assert.equal(imageCalls.length, 1)
  assert.equal(downloads.length, 1)
  assert.equal(store.state.writing.image, false)

  await flow.downloadImage()
  assert.equal(imageCalls.length, 2)
  assert.equal(downloads.length, 2)
})

test('lets the image and the transform be written at the same time', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, transformCalls, downloads } = recorder(store, { delayMs: 20 })
  const flow = createDownloadFlow(store, shell, options)

  const both = Promise.all([flow.downloadImage(), flow.downloadTransform()])
  assert.deepEqual(store.state.writing, { image: true, transform: true })
  await both

  assert.equal(imageCalls.length, 1)
  assert.equal(transformCalls.length, 1)
  assert.deepEqual(
    downloads.map((download) => download.filename).sort(),
    ['registered.ome.zarr.ozx', 'transform.ome.zarr.ozx'],
  )
  assert.deepEqual(store.state.writing, { image: false, transform: false })
})

test('writes the result captured at the click even if a new pair is loaded meanwhile', async () => {
  const store = storeWithResult()
  const shell = recordingShell()
  const { options, imageCalls, downloads } = recorder(store, { delayMs: 20 })
  const flow = createDownloadFlow(store, shell, options)
  const stateAtClick = store.state

  const pending = flow.downloadImage()
  store.update(inputsLoaded(fakeImage('other-fixed.mha'), fakeImage('other-moving.mha')))
  await pending

  assert.equal(imageCalls[0]!.state, stateAtClick)
  assert.equal(downloads.length, 1)
  assert.equal(store.state.result, undefined)
  assert.equal(store.state.writing.image, false)
})

test('plannedFilename names the file the exporter will produce', () => {
  const store = createStore()
  assert.equal(plannedFilename(store.state, 'image'), 'registered.ome.zarr.ozx')
  assert.equal(plannedFilename(store.state, 'transform'), 'transform.ome.zarr.ozx')
  store.update(formatChosen('image', 'nii.gz'))
  store.update(formatChosen('transform', 'elastix-toml'))
  assert.equal(plannedFilename(store.state, 'image'), 'registered.nii.gz')
  assert.equal(plannedFilename(store.state, 'transform'), 'transform-parameters.zip')
})

test('exportStatus shows the bar as determinate only for a counted report with a total', () => {
  assert.deepEqual(exportStatus({ stage: 'convert', message: 'Converting…' }), { message: 'Converting…', busy: true })
  assert.deepEqual(exportStatus({ stage: 'package', message: 'Writing…', completed: 0, total: 0 }), {
    message: 'Writing…',
    busy: true,
  })
  assert.deepEqual(exportStatus({ stage: 'package', message: 'Plane 2 of 5…', completed: 2, total: 5 }), {
    message: 'Plane 2 of 5…',
    busy: true,
    progress: { completed: 2, total: 5 },
  })
  assert.deepEqual(exportStatus({ stage: 'package', message: 'Writing…', total: 5 }), {
    message: 'Writing…',
    busy: true,
  })
})
