// End-to-end tests for the output side of the demo: the format pickers and
// download buttons for the formats named in the Phase 03 playbook, the
// RFC-5 metadata of the two OME-Zarr archives (read in Node from the
// downloaded bytes), and the OZX and OME-TIFF round trips back through the
// fixed file picker. One registration of the 2D CT sample serves the whole
// file: the tests run serially on a page a worker fixture prepares once,
// and every download's bytes are kept for the tests after it. The file
// names asserted here are the ones the user sees; the exporter derives
// them in src/io/export-plan.ts.
import { readFile } from 'node:fs/promises'

import { expect, test as base, type Page } from '@playwright/test'

import type { LoadedImage } from '../src/io/load-image'
import type { OutputKind } from '../src/state'
import {
  CT_MOVING,
  CT_SAMPLE_BUTTON,
  LOAD_TIMEOUT,
  REGISTRATION_TIMEOUT,
  collectPageErrors,
  downloadOutput,
  imageFacts,
  loadSample,
  splashDialog,
  start,
  toasts,
  volumeName,
  waitForSlot,
} from './helpers'
import { expectAffineMatrix, parseOzx, type OzxContents } from './ome-zarr'

const IMAGE_OZX = 'registered.ome.zarr.ozx'
const IMAGE_OME_TIFF = 'registered.ome.tif'
const TRANSFORM_OZX = 'transform.ome.zarr.ozx'

/** Image formats under test, with the file name each download must carry. */
const IMAGE_DOWNLOADS: readonly { id: string; filename: string }[] = [
  { id: 'ozx', filename: IMAGE_OZX },
  { id: 'ome-tiff', filename: IMAGE_OME_TIFF },
  { id: 'nrrd', filename: 'registered.nrrd' },
  { id: 'nii.gz', filename: 'registered.nii.gz' },
]

/** Transform formats under test, with the file name each download must carry. */
const TRANSFORM_DOWNLOADS: readonly { id: string; filename: string }[] = [
  { id: 'ozx-transform', filename: TRANSFORM_OZX },
  { id: 'h5', filename: 'transform.h5' },
  { id: 'tfm', filename: 'transform.tfm' },
  { id: 'elastix-json', filename: 'transform-parameters.json' },
]

/** The two OME downloads the ingest pipeline reads back, with how it reports each. */
const ROUND_TRIPS: readonly {
  filename: string
  mimeType: string
  kind: LoadedImage['kind']
  format: LoadedImage['format']
}[] = [
  { filename: IMAGE_OZX, mimeType: 'application/zip', kind: 'ozx', format: 'OZX' },
  { filename: IMAGE_OME_TIFF, mimeType: 'image/tiff', kind: 'tiff', format: 'OME-TIFF' },
]

/** Axes of the coordinate systems a 2D registration is written over (see src/io/rfc5-transform.ts). */
const AXES_2D = ['y', 'x']

/** Dimension and extents (x first) of the registered image. */
interface ResultFacts {
  dimension: number
  size: number[]
}

/** The registered image the store holds, or undefined until a run has finished. */
function resultFacts(page: Page): Promise<ResultFacts | undefined> {
  return page.evaluate(() => {
    const state = window.__demo?.state?.state
    if (!state?.result || state.registering) {
      return undefined
    }
    return { dimension: state.result.image.imageType.dimension, size: [...state.result.image.size] }
  })
}

/** What the whole file shares. */
interface Session {
  /** The page with the registered pair. */
  page: Page
  /** Uncaught page errors since the last test drained them. */
  errors: string[]
  /** The registered image, as it was when the run finished. */
  registered: ResultFacts
  /** Bytes of every download so far, by the name the browser suggested. */
  files: Map<string, Buffer>
}

const test = base.extend<{}, { session: Session }>({
  session: [
    async ({ browser }, use) => {
      const page = await browser.newPage()
      const errors: string[] = []
      collectPageErrors(page, errors)
      await page.goto('./')
      await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
      await page.locator('#register').click()
      await expect
        .poll(() => resultFacts(page), { message: 'registration should finish', timeout: REGISTRATION_TIMEOUT })
        .toBeDefined()
      const registered = await resultFacts(page)
      if (!registered) {
        throw new Error('the registration result vanished before the tests could use it')
      }
      await use({ page, errors, registered, files: new Map() })
      await page.close()
    },
    { scope: 'worker' },
  ],
})

// Every test builds on the downloads before it, so the file runs in order
// on the one page; a failure skips the rest rather than failing them all.
test.describe.configure({ mode: 'serial' })

test.afterEach(({ session }) => {
  expect(session.errors.splice(0), 'the page should not throw').toEqual([])
})

/** The format id the store holds for `kind`. */
function selectedFormat(page: Page, kind: OutputKind): Promise<string | undefined> {
  return page.evaluate((kind) => {
    const state = window.__demo?.state?.state
    return kind === 'image' ? state?.imageFormat : state?.transformFormat
  }, kind)
}

/** Choose `id` in the `kind` picker as the user would and wait for the store to take it. */
async function chooseFormat(page: Page, kind: OutputKind, id: string): Promise<void> {
  const picker = page.locator(`#${kind}-format`)
  await picker.click()
  await picker.locator(`wa-option[value="${id}"]`).click()
  await expect.poll(() => selectedFormat(page, kind), { message: `the ${kind} picker should take ${id}` }).toBe(id)
}

/** Choose `id`, download it, check the file, and keep its bytes for the tests that follow. */
async function downloadAs(session: Session, kind: OutputKind, id: string, filename: string): Promise<void> {
  const { page, files } = session
  await chooseFormat(page, kind, id)
  const download = await downloadOutput(page, kind)
  expect(download.suggestedFilename()).toBe(filename)
  expect(await download.failure()).toBeNull()
  const bytes = await readFile(await download.path())
  expect(bytes.byteLength, `${filename} should not be empty`).toBeGreaterThan(0)
  // The status row reports the finished download, and no failure toast was raised.
  await expect(toasts(page, 'danger')).toHaveCount(0)
  await expect(page.locator('#status-message')).toContainText(`Downloaded ${filename} (`)
  files.set(filename, bytes)
}

/** The downloaded OZX `filename`, unzipped and its root `zarr.json` parsed (see test/ome-zarr.ts). */
function readOzx(files: ReadonlyMap<string, Buffer>, filename: string): OzxContents {
  const bytes = files.get(filename)
  if (!bytes) {
    throw new Error(`${filename} was not downloaded earlier in this file`)
  }
  return parseOzx(bytes, filename)
}

test('registers the 2D CT pair once for the whole file', ({ session }) => {
  expect(session.registered.dimension).toBe(2)
  expect(session.registered.size).toHaveLength(2)
  for (const extent of session.registered.size) {
    expect(extent).toBeGreaterThan(0)
  }
})

test.describe('image downloads', () => {
  for (const { id, filename } of IMAGE_DOWNLOADS) {
    test(`downloads the registered image as ${id} (${filename})`, async ({ session }) => {
      await downloadAs(session, 'image', id, filename)
    })
  }
})

test.describe('transform downloads', () => {
  for (const { id, filename } of TRANSFORM_DOWNLOADS) {
    test(`downloads the transform as ${id} (${filename})`, async ({ session }) => {
      await downloadAs(session, 'transform', id, filename)
    })
  }
})

test.describe('OME-Zarr RFC-5 metadata', () => {
  test('the transform OZX holds one affine from the fixed to the moving coordinate system', ({ session }) => {
    const { entries, root } = readOzx(session.files, TRANSFORM_OZX)
    // A transform-only store is a single group document; RFC-9 wants the
    // root zarr.json to lead the archive.
    expect(entries).toEqual(['zarr.json'])
    expect(root).toMatchObject({ zarr_format: 3, node_type: 'group' })

    const { ome } = root.attributes
    expect(ome.version).toBe('0.6')
    const { scene } = ome
    expect(scene, 'a transformation between two images lives under ome.scene').toBeDefined()
    expect(scene?.coordinateSystems?.map((system) => system.name)).toEqual(['fixed', 'moving'])
    for (const system of scene?.coordinateSystems ?? []) {
      expect(system.axes.map((axis) => axis.name), `${system.name} spans the registered axes`).toEqual(AXES_2D)
    }

    expect(scene?.coordinateTransformations).toHaveLength(1)
    const [affine] = scene?.coordinateTransformations ?? []
    expect(affine).toMatchObject({
      type: 'affine',
      name: 'fixed_to_moving',
      input: { name: 'fixed' },
      output: { name: 'moving' },
    })
    expectAffineMatrix(affine?.affine, 2)
  })

  test('the image OZX embeds the same affine on its multiscales entry, into the moving system', ({ session }) => {
    const { entries, root } = readOzx(session.files, IMAGE_OZX)
    expect(entries[0], 'RFC-9 wants the root zarr.json to lead the archive').toBe('zarr.json')

    const { ome } = root.attributes
    expect(ome.version).toBe('0.6')
    expect(ome.multiscales).toHaveLength(1)
    const [multiscales] = ome.multiscales ?? []
    // The pyramid's own (intrinsic) system comes first; the moving image's
    // is the one the affine maps into.
    expect(multiscales?.coordinateSystems.map((system) => system.name)).toEqual(['intrinsic', 'moving'])
    for (const system of multiscales?.coordinateSystems ?? []) {
      expect(system.axes.map((axis) => axis.name), `${system.name} spans the registered axes`).toEqual(AXES_2D)
    }

    expect(multiscales?.coordinateTransformations).toHaveLength(1)
    const [affine] = multiscales?.coordinateTransformations ?? []
    expect(affine).toMatchObject({
      type: 'affine',
      name: 'fixed_to_moving',
      input: { name: 'intrinsic' },
      output: { name: 'moving' },
    })
    expectAffineMatrix(affine?.affine, 2)

    // One registration, one mapping: the standalone transform carries the
    // same matrix under its own input name.
    const standalone = readOzx(session.files, TRANSFORM_OZX).root.attributes.ome.scene?.coordinateTransformations[0]
    expect(affine?.affine).toEqual(standalone?.affine)
  })
})

test.describe('round trips through the fixed picker', () => {
  for (const { filename, mimeType, kind, format } of ROUND_TRIPS) {
    test(`reloads ${filename} as the fixed image, reported as ${format}`, async ({ session }) => {
      const { page, files, registered } = session
      const bytes = files.get(filename)
      expect(bytes, `${filename} is downloaded earlier in this file`).toBeDefined()

      // The reopened dialog starts from the pair the app holds, so only
      // the fixed slot changes; the moving slice stays for the pair check.
      await page.locator('#load-images').click()
      await expect(splashDialog(page)).toBeVisible()
      await page.locator('#fixed-file').setInputFiles({ name: filename, mimeType, buffer: bytes ?? Buffer.alloc(0) })
      await waitForSlot(page, 'fixed', filename)
      await expect(page.locator('#splash-error')).toBeHidden()

      const expected = { name: filename, kind, format, dimension: registered.dimension, size: registered.size }
      expect(await imageFacts(page, 'splash', 'fixed')).toMatchObject(expected)

      await start(page)
      expect(await imageFacts(page, 'store', 'fixed')).toMatchObject(expected)
      expect((await imageFacts(page, 'store', 'moving'))?.name).toBe(CT_MOVING)
      await expect.poll(() => volumeName(page, 'fixed')).toContain(filename)
      // A new pair drops the result it did not come from.
      expect(await resultFacts(page)).toBeUndefined()
    })
  }
})
