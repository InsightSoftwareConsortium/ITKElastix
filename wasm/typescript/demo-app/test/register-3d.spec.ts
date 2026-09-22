// End-to-end 3D registration: the MNI pair from the splash at full
// resolution, one affine run at the default settings, the result and
// overlay switches on, and the two default OME-Zarr downloads read back in
// Node, the transform's affine three rows deep. One long browser session,
// so the test is marked slow and capped at ten minutes; only the chromium
// project launches with the SwiftShader WebGL2 flags niivue needs, so it
// skips elsewhere. Elements are found by their stable ids; the store and
// the niivue instances are read through `window.__demo` with the helpers
// in test/helpers.ts, and the archives with test/ome-zarr.ts.
import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import {
  LOAD_TIMEOUT_3D,
  MNI_FIXED,
  MNI_MOVING,
  MNI_SAMPLE_BUTTON,
  REGISTRATION_TIMEOUT_3D,
  collectPageErrors,
  downloadOutput,
  imageFacts,
  loadSample,
  selectValue,
  switchState,
  toasts,
  volumeCount,
  volumeFacts,
  volumeName,
} from './helpers'
import { expectAffineMatrix, parseOzx } from './ome-zarr'

/**
 * Ceiling for the whole run, loading and downloads included. `test.slow()`
 * on its own would triple the project timeout, so the cap is set after it.
 */
const TEST_TIMEOUT_3D = 600_000

/** The default formats of the two pickers (see src/io/formats.ts) and the files they write. */
const IMAGE_OZX = 'registered.ome.zarr.ozx'
const TRANSFORM_OZX = 'transform.ome.zarr.ozx'

/** Axes of the coordinate systems a 3D registration is written over, in Zarr order (see src/io/rfc5-transform.ts). */
const AXES_3D = ['z', 'y', 'x']

test('registers the 3D MNI pair end to end and downloads the OME-Zarr image and transform', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'only the chromium project launches with the WebGL2 flags niivue needs')
  test.slow()
  test.setTimeout(TEST_TIMEOUT_3D)

  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const showResult = page.locator('#show-result')
  const overlayToggle = page.locator('#overlay-toggle')
  /** The affine the registered image's own archive embeds, to compare with the standalone transform. */
  let imageAffine: number[][] | undefined

  await test.step('load the 3D MNI pair from the splash at full resolution', async () => {
    await page.goto('./')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)
    expect(await imageFacts(page, 'store', 'fixed')).toMatchObject({ name: MNI_FIXED, dimension: 3, scaleIndex: 0 })
    expect(await imageFacts(page, 'store', 'moving')).toMatchObject({ name: MNI_MOVING, dimension: 3, scaleIndex: 0 })
    // A 3D pair gets the slice layout picker; the result switch waits for a run.
    await expect(page.locator('#slice-type')).toBeVisible()
    expect(await switchState(showResult)).toEqual({ disabled: true, checked: false })
    expect(await switchState(overlayToggle)).toEqual({ disabled: false, checked: false })
  })

  await test.step('register at the default settings and wait for the result switch', async () => {
    await page.locator('#register').click()
    await expect
      .poll(async () => (await switchState(showResult)).disabled, {
        message: 'the 3D registration should finish and enable "Show registered result"',
        timeout: REGISTRATION_TIMEOUT_3D,
      })
      .toBe(false)
    await expect(toasts(page, 'danger')).toHaveCount(0)
  })

  await test.step('enable the result switch: the registered volume replaces the moving image', async () => {
    // A finished run switches the result on by itself (`resultReady` in
    // src/state.ts); switching it off and on again is the user's "enable".
    expect((await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(false)
    await expect.poll(() => volumeName(page, 'moving')).toContain('MNI305')

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')
    expect(await volumeName(page, 'fixed')).toContain('MNI152')
  })

  await test.step('enable overlay: the registered result over the fixed image in red', async () => {
    await overlayToggle.click()
    await expect.poll(() => volumeCount(page, 'fixed')).toBe(2)
    const [base, overlay] = (await volumeFacts(page, 'fixed'))!
    expect(base!.name).toContain('MNI152')
    expect(base!.colormap).toBe('Gray')
    expect(overlay!.name).toContain('registered')
    expect(overlay!.colormap).toBe('Red')
    expect(overlay!.opacity).toBeCloseTo(0.5)
    expect(await volumeCount(page, 'moving')).toBe(1)
  })

  await test.step('the summary card shows a three-axis affine', async () => {
    await expect(page.locator('#registration-summary')).toBeVisible()
    await expect(page.locator('#registration-matrix thead th')).toHaveText(['', ...AXES_3D, 'offset'])
    await expect(page.locator('#registration-matrix tbody tr')).toHaveCount(3)
  })

  await test.step('download the registered image as OME-Zarr (.ozx)', async () => {
    expect(await selectValue(page.locator('#image-format'))).toBe('ozx')
    const download = await downloadOutput(page, 'image')
    expect(download.suggestedFilename()).toBe(IMAGE_OZX)
    expect(await download.failure()).toBeNull()
    const bytes = await readFile(await download.path())
    expect(bytes.byteLength, `${IMAGE_OZX} should not be empty`).toBeGreaterThan(0)
    await expect(page.locator('#status-message')).toContainText(`Downloaded ${IMAGE_OZX} (`)

    const { entries, root } = parseOzx(bytes, IMAGE_OZX)
    expect(entries[0], 'RFC-9 wants the root zarr.json to lead the archive').toBe('zarr.json')
    const [multiscales] = root.attributes.ome.multiscales ?? []
    expect(multiscales?.coordinateSystems.map((system) => system.name)).toEqual(['intrinsic', 'moving'])
    for (const system of multiscales?.coordinateSystems ?? []) {
      expect(system.axes.map((axis) => axis.name), `${system.name} spans the three registered axes`).toEqual(AXES_3D)
    }
    imageAffine = multiscales?.coordinateTransformations?.[0]?.affine
    expectAffineMatrix(imageAffine, 3)
  })

  await test.step('download the transform as OME-Zarr (.ozx): a three-row affine from fixed to moving', async () => {
    expect(await selectValue(page.locator('#transform-format'))).toBe('ozx-transform')
    const download = await downloadOutput(page, 'transform')
    expect(download.suggestedFilename()).toBe(TRANSFORM_OZX)
    expect(await download.failure()).toBeNull()
    const bytes = await readFile(await download.path())
    expect(bytes.byteLength, `${TRANSFORM_OZX} should not be empty`).toBeGreaterThan(0)
    await expect(page.locator('#status-message')).toContainText(`Downloaded ${TRANSFORM_OZX} (`)

    const { entries, root } = parseOzx(bytes, TRANSFORM_OZX)
    expect(entries).toEqual(['zarr.json'])
    const { scene } = root.attributes.ome
    expect(scene?.coordinateSystems?.map((system) => system.name)).toEqual(['fixed', 'moving'])
    for (const system of scene?.coordinateSystems ?? []) {
      expect(system.axes.map((axis) => axis.name), `${system.name} spans the three registered axes`).toEqual(AXES_3D)
    }
    expect(scene?.coordinateTransformations).toHaveLength(1)
    const [affine] = scene?.coordinateTransformations ?? []
    expect(affine).toMatchObject({
      type: 'affine',
      name: 'fixed_to_moving',
      input: { name: 'fixed' },
      output: { name: 'moving' },
    })
    expectAffineMatrix(affine?.affine, 3)
    // One registration, one mapping: the image archive embeds the same matrix.
    expect(affine?.affine).toEqual(imageAffine)
    // Both templates sit in MNI space, so the linear part is close to the
    // identity (about 0.92, 0.99, 0.98 on the diagonal here); a transposed
    // or garbage matrix would not be.
    for (const [i, row] of (affine?.affine ?? []).entries()) {
      expect(Math.abs(row[i]! - 1), `diagonal entry ${i} of ${JSON.stringify(row)}`).toBeLessThan(0.5)
    }
  })

  await expect(toasts(page, 'danger')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
