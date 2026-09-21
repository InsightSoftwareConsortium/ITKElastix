// Viewer behaviour: the two panels navigate together in both directions
// (the crosshair through world millimetres, the 2D pan and zoom, the 3D
// camera), the link survives the result toggle swapping the moving panel's
// volume, "Reset view" restores the defaults on both, the slice layout
// picker is hidden for a 2D pair and drives both panels for a 3D pair, and
// each panel's colormap picker applies to that panel only and outlives a
// swap. Elements are found by their stable ids; niivue state is read
// through `window.__demo` with the helpers in test/helpers.ts.
import { expect, test, type Page } from '@playwright/test'
import { SLICE_TYPE } from '@niivue/niivue'

import {
  CT_SAMPLE_BUTTON,
  LOAD_TIMEOUT,
  LOAD_TIMEOUT_3D,
  MNI_SAMPLE_BUTTON,
  REGISTRATION_TIMEOUT,
  collectPageErrors,
  loadSample,
  navigate,
  selectValue,
  sliceType,
  switchState,
  viewFacts,
  volumeColormap,
  volumeName,
} from './helpers'

/** niivue's scene defaults, which "Reset view" restores (see src/viewer/panel.ts). */
const DEFAULT_PAN = [0, 0, 0, 1]
const DEFAULT_CROSSHAIR = [0.5, 0.5, 0.5]
const DEFAULT_AZIMUTH = 110
const DEFAULT_ELEVATION = 10

/** Tolerance for values that pass through niivue's mm <-> scene fraction round trip. */
const TOLERANCE = 1e-3

/**
 * Largest difference between the two panels' crosshair (in mm), pan, zoom,
 * and camera; infinite while either panel is empty. Polled until the
 * broadcast has landed, which happens on the source panel's next frame.
 */
async function viewMismatch(page: Page): Promise<number> {
  const [fixed, moving] = await Promise.all([viewFacts(page, 'fixed'), viewFacts(page, 'moving')])
  if (!fixed || !moving) {
    return Number.POSITIVE_INFINITY
  }
  const pairs: [number, number][] = [
    ...fixed.crosshairMm.map((value, i): [number, number] => [value, moving.crosshairMm[i]!]),
    ...fixed.pan.map((value, i): [number, number] => [value, moving.pan[i]!]),
    [fixed.zoom, moving.zoom],
    [fixed.azimuth, moving.azimuth],
    [fixed.elevation, moving.elevation],
  ]
  return Math.max(...pairs.map(([a, b]) => Math.abs(a - b)))
}

async function expectPanelsToAgree(page: Page): Promise<void> {
  await expect.poll(() => viewMismatch(page), { message: 'the two panels should show the same view' }).toBeLessThan(TOLERANCE)
}

function closeTo(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]!) < TOLERANCE)
}

/** Choose `value` in the `wa-select` with `id` through the UI, which is what fires `change`. */
async function pick(page: Page, id: string, value: string): Promise<void> {
  await page.locator(`#${id}`).click()
  await page.locator(`#${id} wa-option[value="${value}"]`).click()
  await expect.poll(() => selectValue(page.locator(`#${id}`))).toBe(value)
}

test('links navigation both ways, across the result toggle, and resets it for a 2D pair', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  await test.step('load the 2D CT pair: no layout picker, both panels axial and in agreement', async () => {
    await page.goto('/')
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    await expect(page.locator('#slice-type')).toBeHidden()
    expect(await sliceType(page, 'fixed')).toBe(SLICE_TYPE.AXIAL)
    expect(await sliceType(page, 'moving')).toBe(SLICE_TYPE.AXIAL)
    await expectPanelsToAgree(page)
  })

  await test.step('moving the fixed panel moves the moving panel', async () => {
    await navigate(page, 'fixed', { crosshair: [0.4, 0.6, 0.5], pan: [12, -8, 0, 2] })
    await expectPanelsToAgree(page)
    const moving = (await viewFacts(page, 'moving'))!
    expect(closeTo(moving.pan, [12, -8, 0, 2])).toBe(true)
  })

  await test.step('moving the moving panel moves the fixed panel', async () => {
    await navigate(page, 'moving', { crosshair: [0.55, 0.45, 0.5], pan: [-3, 5, 0, 1.5] })
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'fixed'))!
    expect(closeTo(fixed.pan, [-3, 5, 0, 1.5])).toBe(true)
  })

  await test.step('the registered result adopts the view and stays linked', async () => {
    const before = (await viewFacts(page, 'fixed'))!
    await page.locator('#register').click()
    const showResult = page.locator('#show-result')
    await expect
      .poll(async () => (await switchState(showResult)).disabled, { timeout: REGISTRATION_TIMEOUT })
      .toBe(false)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')

    // The swap keeps the view: the result lands where the moving image was.
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'fixed'))!
    expect(closeTo(fixed.pan, before.pan)).toBe(true)
    expect(closeTo(fixed.crosshairMm, before.crosshairMm)).toBe(true)

    await navigate(page, 'fixed', { crosshair: [0.45, 0.5, 0.5], pan: [6, 4, 0, 1.25] })
    await expectPanelsToAgree(page)
    expect(closeTo((await viewFacts(page, 'moving'))!.pan, [6, 4, 0, 1.25])).toBe(true)

    // Back to the moving image, and the link still runs the other way too.
    await showResult.click()
    await expect.poll(() => volumeName(page, 'moving')).not.toContain('registered')
    await expectPanelsToAgree(page)
    await navigate(page, 'moving', { crosshair: [0.5, 0.55, 0.5], pan: [-2, -2, 0, 1.75] })
    await expectPanelsToAgree(page)
    expect(closeTo((await viewFacts(page, 'fixed'))!.pan, [-2, -2, 0, 1.75])).toBe(true)
  })

  await test.step('"Reset view" returns both panels to the defaults, centred on the fixed image', async () => {
    await page.locator('#reset-view').click()
    // The fixed panel's crosshair returns to its own centre; the moving
    // panel's follows it in mm, which is its centre only if the grids match.
    await expect
      .poll(async () => {
        const facts = (await viewFacts(page, 'fixed'))!
        return closeTo(facts.pan, DEFAULT_PAN) && closeTo(facts.crosshair, DEFAULT_CROSSHAIR) && facts.zoom === 1
      })
      .toBe(true)
    await expect
      .poll(async () => {
        const facts = (await viewFacts(page, 'moving'))!
        return closeTo(facts.pan, DEFAULT_PAN) && facts.zoom === 1
      })
      .toBe(true)
    await expectPanelsToAgree(page)
  })

  expect(pageErrors).toEqual([])
})

test('the colormap pickers apply per panel and survive the result toggle', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  await page.goto('/')
  await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)

  await test.step('both panels start on Gray and the pickers say so', async () => {
    expect(await selectValue(page.locator('#fixed-colormap'))).toBe('Gray')
    expect(await selectValue(page.locator('#moving-colormap'))).toBe('Gray')
    expect(await volumeColormap(page, 'fixed')).toBe('Gray')
    expect(await volumeColormap(page, 'moving')).toBe('Gray')
    // The pickers list niivue's built-in names.
    const options = await page.locator('#moving-colormap wa-option').evaluateAll((nodes) => nodes.length)
    expect(options).toBeGreaterThan(20)
  })

  await test.step('a picker changes its own panel only', async () => {
    await pick(page, 'moving-colormap', 'Hot')
    await expect.poll(() => volumeColormap(page, 'moving')).toBe('Hot')
    expect(await volumeColormap(page, 'fixed')).toBe('Gray')

    await pick(page, 'fixed-colormap', 'Cividis')
    await expect.poll(() => volumeColormap(page, 'fixed')).toBe('Cividis')
    expect(await volumeColormap(page, 'moving')).toBe('Hot')
  })

  await test.step('the registered result and the moving image both keep the panel colormap', async () => {
    await page.locator('#register').click()
    const showResult = page.locator('#show-result')
    await expect
      .poll(async () => (await switchState(showResult)).disabled, { timeout: REGISTRATION_TIMEOUT })
      .toBe(false)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')
    await expect.poll(() => volumeColormap(page, 'moving')).toBe('Hot')

    await showResult.click()
    await expect.poll(() => volumeName(page, 'moving')).not.toContain('registered')
    await expect.poll(() => volumeColormap(page, 'moving')).toBe('Hot')
    expect(await volumeColormap(page, 'fixed')).toBe('Cividis')
    expect(await selectValue(page.locator('#moving-colormap'))).toBe('Hot')
    expect(await selectValue(page.locator('#fixed-colormap'))).toBe('Cividis')
  })

  expect(pageErrors).toEqual([])
})

test('the slice layout picker drives both panels and the 3D camera is linked for a 3D pair', async ({ page }) => {
  test.slow()
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  await test.step('load the 3D MNI pair: the picker shows, both panels multiplanar', async () => {
    await page.goto('/')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)
    await expect(page.locator('#slice-type')).toBeVisible()
    expect(await selectValue(page.locator('#slice-type'))).toBe('multiplanar')
    expect(await sliceType(page, 'fixed')).toBe(SLICE_TYPE.MULTIPLANAR)
    expect(await sliceType(page, 'moving')).toBe(SLICE_TYPE.MULTIPLANAR)
    await expectPanelsToAgree(page)
  })

  await test.step('each layout applies to both panels', async () => {
    for (const [id, expected] of [
      ['sagittal', SLICE_TYPE.SAGITTAL],
      ['coronal', SLICE_TYPE.CORONAL],
      ['axial', SLICE_TYPE.AXIAL],
      ['render', SLICE_TYPE.RENDER],
    ] as const) {
      await pick(page, 'slice-type', id)
      await expect.poll(() => sliceType(page, 'fixed')).toBe(expected)
      await expect.poll(() => sliceType(page, 'moving')).toBe(expected)
    }
  })

  await test.step('the 3D camera is linked both ways and reset restores it', async () => {
    await navigate(page, 'fixed', { azimuth: 45, elevation: -20, zoom: 1.5 })
    await expectPanelsToAgree(page)
    const moving = (await viewFacts(page, 'moving'))!
    expect([moving.azimuth, moving.elevation, moving.zoom]).toEqual([45, -20, 1.5])

    await navigate(page, 'moving', { azimuth: 200, elevation: 30 })
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'fixed'))!
    expect([fixed.azimuth, fixed.elevation]).toEqual([200, 30])

    await page.locator('#reset-view').click()
    for (const role of ['fixed', 'moving'] as const) {
      await expect
        .poll(async () => {
          const facts = (await viewFacts(page, role))!
          return [facts.azimuth, facts.elevation, facts.zoom]
        })
        .toEqual([DEFAULT_AZIMUTH, DEFAULT_ELEVATION, 1])
    }
  })

  await test.step('back to multiplanar on both panels', async () => {
    await pick(page, 'slice-type', 'multiplanar')
    await expect.poll(() => sliceType(page, 'fixed')).toBe(SLICE_TYPE.MULTIPLANAR)
    await expect.poll(() => sliceType(page, 'moving')).toBe(SLICE_TYPE.MULTIPLANAR)
  })

  expect(pageErrors).toEqual([])
})
