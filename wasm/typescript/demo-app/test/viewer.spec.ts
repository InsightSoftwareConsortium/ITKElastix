// Viewer behaviour: the four panels (two per comparison) navigate together
// in every direction (the crosshair through world millimetres, the 2D pan
// and zoom, the 3D camera), the link survives the result switch swapping
// the result comparison's moving side, "Reset view" restores the defaults
// on all of them and centres the comparison dividers, the slice layout
// picker is hidden for a 2D pair and drives every panel for a 3D pair,
// each colormap picker applies to its side of both comparisons and
// outlives a swap, and each comparison puts the fixed image on the left of
// a divider that reveals the moving image, or the registered result, on
// the right, the two dividers moving together and a 2D pair drawn without
// a crosshair. The responsive split (a 700 px viewport stacks the
// comparisons) and the theme toggle persisting across a reload are in
// test/layout.spec.ts, and the 3D run from sample to downloads is in
// test/register-3d.spec.ts. Elements are found by their stable ids; niivue
// state is read through `window.__demo` with the helpers in
// test/helpers.ts.
import { expect, test, type Page } from '@playwright/test'
import { SLICE_TYPE } from '@niivue/niivue'

import { CROSSHAIR_WIDTH } from '../src/ui/view-options'
import { COMPARISON_ROLES, PANEL_ROLES, type ComparisonRole } from '../src/viewer/comparison-options'
import {
  CT_SAMPLE_BUTTON,
  LOAD_TIMEOUT,
  LOAD_TIMEOUT_3D,
  MNI_SAMPLE_BUTTON,
  caption,
  collectPageErrors,
  comparisonPosition,
  crosshairWidth,
  holdRegistration,
  loadSample,
  navigate,
  panelAtPoint,
  selectValue,
  sliceType,
  viewFacts,
  volumeColormap,
  volumeCount,
  volumeName,
  waitForResult,
} from './helpers'

/** niivue's scene defaults, which "Reset view" restores (see src/viewer/panel.ts). */
const DEFAULT_PAN = [0, 0, 0, 1]
const DEFAULT_CROSSHAIR = [0.5, 0.5, 0.5]
const DEFAULT_AZIMUTH = 110
const DEFAULT_ELEVATION = 10

/** Tolerance for values that pass through niivue's mm <-> scene fraction round trip. */
const TOLERANCE = 1e-3

/**
 * Largest difference between any panel and the first one's crosshair (in
 * mm), pan, zoom, and camera; infinite while any panel is empty. Polled
 * until the broadcast has landed, which happens on the source panel's next
 * frame.
 */
async function viewMismatch(page: Page): Promise<number> {
  const facts = await Promise.all(PANEL_ROLES.map((role) => viewFacts(page, role)))
  const [leader, ...others] = facts
  if (facts.some((fact) => fact === undefined)) {
    return Number.POSITIVE_INFINITY
  }
  let worst = 0
  for (const other of others) {
    const pairs: [number, number][] = [
      ...leader!.crosshairMm.map((value, i): [number, number] => [value, other!.crosshairMm[i]!]),
      ...leader!.pan.map((value, i): [number, number] => [value, other!.pan[i]!]),
      [leader!.zoom, other!.zoom],
      [leader!.azimuth, other!.azimuth],
      [leader!.elevation, other!.elevation],
    ]
    worst = Math.max(worst, ...pairs.map(([a, b]) => Math.abs(a - b)))
  }
  return worst
}

async function expectPanelsToAgree(page: Page): Promise<void> {
  await expect.poll(() => viewMismatch(page), { message: 'every panel should show the same view' }).toBeLessThan(TOLERANCE)
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

/** Let the run the load started, parked by `release`'s hold, finish with its result. */
async function finishRegistration(page: Page, release: () => Promise<void>): Promise<void> {
  await release()
  await waitForResult(page)
}

test('links navigation across the four panels, across the result switch, and resets it for a 2D pair', async ({
  page,
}) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const releaseRegistration = await holdRegistration(page)

  await test.step('load the 2D CT pair: no layout picker, every panel axial and in agreement', async () => {
    await page.goto('./')
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    await expect(page.locator('#slice-type')).toBeHidden()
    for (const role of PANEL_ROLES) {
      expect(await sliceType(page, role), role).toBe(SLICE_TYPE.AXIAL)
    }
    await expectPanelsToAgree(page)
  })

  await test.step('moving a fixed panel moves the others', async () => {
    await navigate(page, 'inputs-fixed', { crosshair: [0.4, 0.6, 0.5], pan: [12, -8, 0, 2] })
    await expectPanelsToAgree(page)
    const other = (await viewFacts(page, 'result-moving'))!
    expect(closeTo(other.pan, [12, -8, 0, 2])).toBe(true)
  })

  await test.step('moving a moving panel moves the others', async () => {
    await navigate(page, 'result-moving', { crosshair: [0.55, 0.45, 0.5], pan: [-3, 5, 0, 1.5] })
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'inputs-fixed'))!
    expect(closeTo(fixed.pan, [-3, 5, 0, 1.5])).toBe(true)
  })

  await test.step('the registered result adopts the view and stays linked', async () => {
    const before = (await viewFacts(page, 'inputs-fixed'))!
    await finishRegistration(page, releaseRegistration)
    const showResult = page.locator('#show-result')
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')

    // The swap keeps the view: the result lands where the moving image was.
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'inputs-fixed'))!
    expect(closeTo(fixed.pan, before.pan)).toBe(true)
    expect(closeTo(fixed.crosshairMm, before.crosshairMm)).toBe(true)

    await navigate(page, 'inputs-fixed', { crosshair: [0.45, 0.5, 0.5], pan: [6, 4, 0, 1.25] })
    await expectPanelsToAgree(page)
    expect(closeTo((await viewFacts(page, 'result-moving'))!.pan, [6, 4, 0, 1.25])).toBe(true)

    // Back to the moving image, and the link still runs from that panel too.
    await showResult.click()
    await expect.poll(() => volumeName(page, 'result-moving')).not.toContain('registered')
    await expectPanelsToAgree(page)
    await navigate(page, 'result-moving', { crosshair: [0.5, 0.55, 0.5], pan: [-2, -2, 0, 1.75] })
    await expectPanelsToAgree(page)
    expect(closeTo((await viewFacts(page, 'inputs-moving'))!.pan, [-2, -2, 0, 1.75])).toBe(true)
  })

  await test.step('"Reset view" returns every panel to the defaults, centred on the fixed image', async () => {
    await page.locator('#reset-view').click()
    // The fixed panels' crosshair returns to their own centre; the moving
    // ones' follows it in mm, which is their centre only if the grids match.
    for (const role of ['inputs-fixed', 'result-fixed'] as const) {
      await expect
        .poll(async () => {
          const facts = (await viewFacts(page, role))!
          return closeTo(facts.pan, DEFAULT_PAN) && closeTo(facts.crosshair, DEFAULT_CROSSHAIR) && facts.zoom === 1
        })
        .toBe(true)
    }
    for (const role of ['inputs-moving', 'result-moving'] as const) {
      await expect
        .poll(async () => {
          const facts = (await viewFacts(page, role))!
          return closeTo(facts.pan, DEFAULT_PAN) && facts.zoom === 1
        })
        .toBe(true)
    }
    await expectPanelsToAgree(page)
  })

  expect(pageErrors).toEqual([])
})

test('the colormap pickers apply to their side of both comparisons and survive the result switch', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const releaseRegistration = await holdRegistration(page)

  await page.goto('./')
  await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)

  await test.step('every panel starts on Gray and the pickers say so', async () => {
    expect(await selectValue(page.locator('#fixed-colormap'))).toBe('Gray')
    expect(await selectValue(page.locator('#moving-colormap'))).toBe('Gray')
    for (const role of PANEL_ROLES) {
      expect(await volumeColormap(page, role), role).toBe('Gray')
    }
    // The pickers list niivue's built-in names.
    const options = await page.locator('#moving-colormap wa-option').evaluateAll((nodes) => nodes.length)
    expect(options).toBeGreaterThan(20)
  })

  await test.step('a picker changes its side of both comparisons only', async () => {
    await pick(page, 'moving-colormap', 'Hot')
    await expect.poll(() => volumeColormap(page, 'inputs-moving')).toBe('Hot')
    await expect.poll(() => volumeColormap(page, 'result-moving')).toBe('Hot')
    expect(await volumeColormap(page, 'inputs-fixed')).toBe('Gray')
    expect(await volumeColormap(page, 'result-fixed')).toBe('Gray')

    await pick(page, 'fixed-colormap', 'Cividis')
    await expect.poll(() => volumeColormap(page, 'inputs-fixed')).toBe('Cividis')
    await expect.poll(() => volumeColormap(page, 'result-fixed')).toBe('Cividis')
    expect(await volumeColormap(page, 'inputs-moving')).toBe('Hot')
    expect(await volumeColormap(page, 'result-moving')).toBe('Hot')
  })

  await test.step('the registered result and the moving image both keep the side colormap', async () => {
    await finishRegistration(page, releaseRegistration)
    const showResult = page.locator('#show-result')
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')
    await expect.poll(() => volumeColormap(page, 'result-moving')).toBe('Hot')

    await showResult.click()
    await expect.poll(() => volumeName(page, 'result-moving')).not.toContain('registered')
    await expect.poll(() => volumeColormap(page, 'result-moving')).toBe('Hot')
    expect(await volumeColormap(page, 'result-fixed')).toBe('Cividis')
    expect(await selectValue(page.locator('#moving-colormap'))).toBe('Hot')
    expect(await selectValue(page.locator('#fixed-colormap'))).toBe('Cividis')
  })

  expect(pageErrors).toEqual([])
})

test('the slice layout picker drives every panel and the 3D camera is linked for a 3D pair', async ({ page }) => {
  test.slow()
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  // Parked for good: the 3D run the load starts would only compete with the panels for the CPU.
  await holdRegistration(page)

  await test.step('load the 3D MNI pair: the picker shows, every panel multiplanar with a crosshair', async () => {
    await page.goto('./')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)
    await expect(page.locator('#slice-type')).toBeVisible()
    expect(await selectValue(page.locator('#slice-type'))).toBe('multiplanar')
    for (const role of PANEL_ROLES) {
      expect(await sliceType(page, role), role).toBe(SLICE_TYPE.MULTIPLANAR)
      expect(await crosshairWidth(page, role), role).toBe(CROSSHAIR_WIDTH)
    }
    await expectPanelsToAgree(page)
  })

  await test.step('each layout applies to every panel', async () => {
    for (const [id, expected] of [
      ['sagittal', SLICE_TYPE.SAGITTAL],
      ['coronal', SLICE_TYPE.CORONAL],
      ['axial', SLICE_TYPE.AXIAL],
      ['render', SLICE_TYPE.RENDER],
    ] as const) {
      await pick(page, 'slice-type', id)
      for (const role of PANEL_ROLES) {
        await expect.poll(() => sliceType(page, role), `${role} should be ${id}`).toBe(expected)
      }
    }
  })

  await test.step('the 3D camera is linked both ways and reset restores it', async () => {
    await navigate(page, 'inputs-fixed', { azimuth: 45, elevation: -20, zoom: 1.5 })
    await expectPanelsToAgree(page)
    const moving = (await viewFacts(page, 'result-moving'))!
    expect([moving.azimuth, moving.elevation, moving.zoom]).toEqual([45, -20, 1.5])

    await navigate(page, 'inputs-moving', { azimuth: 200, elevation: 30 })
    await expectPanelsToAgree(page)
    const fixed = (await viewFacts(page, 'result-fixed'))!
    expect([fixed.azimuth, fixed.elevation]).toEqual([200, 30])

    await page.locator('#reset-view').click()
    for (const role of PANEL_ROLES) {
      await expect
        .poll(async () => {
          const facts = (await viewFacts(page, role))!
          return [facts.azimuth, facts.elevation, facts.zoom]
        })
        .toEqual([DEFAULT_AZIMUTH, DEFAULT_ELEVATION, 1])
    }
  })

  await test.step('back to multiplanar on every panel', async () => {
    await pick(page, 'slice-type', 'multiplanar')
    for (const role of PANEL_ROLES) {
      await expect.poll(() => sliceType(page, role)).toBe(SLICE_TYPE.MULTIPLANAR)
    }
  })

  expect(pageErrors).toEqual([])
})

test('each comparison puts the fixed image left of a divider that reveals the moving image, then the result', async ({
  page,
}) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const releaseRegistration = await holdRegistration(page)

  /** Both dividers, in comparison order. */
  async function positions(): Promise<number[]> {
    return Promise.all(COMPARISON_ROLES.map((comparison) => comparisonPosition(page, comparison)))
  }

  /** The panel under the vertical middle of `comparison`, at `x` of its width. */
  function panelAt(comparison: ComparisonRole, x: number): Promise<string | undefined> {
    return panelAtPoint(page, comparison, x, 0.5)
  }

  await test.step('load the 2D CT pair: the fixed image beside the moving image in both comparisons', async () => {
    await page.goto('./')
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    expect(await positions()).toEqual([50, 50])
    for (const comparison of COMPARISON_ROLES) {
      expect(await volumeName(page, `${comparison}-fixed`)).toContain('CT_2D_head_fixed')
      expect(await volumeName(page, `${comparison}-moving`)).toContain('CT_2D_head_moving')
      expect(await caption(page, `${comparison}-fixed`)).toEqual({
        text: 'Fixed · CT_2D_head_fixed.mha',
        variant: 'neutral',
      })
      expect(await caption(page, `${comparison}-moving`)).toEqual({
        text: 'Moving · CT_2D_head_moving.mha',
        variant: 'brand',
      })
      // A click left of the divider reaches the fixed panel, right of it the moving panel.
      expect(await panelAt(comparison, 0.25)).toBe(`${comparison}-fixed`)
      expect(await panelAt(comparison, 0.75)).toBe(`${comparison}-moving`)
    }
    for (const role of PANEL_ROLES) {
      expect(await volumeCount(page, role), role).toBe(1)
      // The crosshair would only cover a 2D picture.
      expect(await crosshairWidth(page, role), role).toBe(0)
    }
  })

  await test.step('the arrow keys on one handle move both dividers', async () => {
    const handle = page.locator('#inputs-comparison [part~="handle"]')
    await handle.focus()
    await page.keyboard.press('Shift+ArrowRight')
    await expect.poll(positions).toEqual([60, 60])
    // The fixed image now reaches past the middle of both comparisons.
    for (const comparison of COMPARISON_ROLES) {
      expect(await panelAt(comparison, 0.55)).toBe(`${comparison}-fixed`)
    }
  })

  await test.step('dragging one divider moves both', async () => {
    const divider = page.locator('#result-comparison [part~="divider"]')
    const dividerBox = (await divider.boundingBox())!
    const box = (await page.locator('[data-comparison="result"]').boundingBox())!
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => comparisonPosition(page, 'result')).toBeCloseTo(30, 0)
    const dragged = await comparisonPosition(page, 'result')
    await expect.poll(positions).toEqual([dragged, dragged])
    for (const comparison of COMPARISON_ROLES) {
      expect(await panelAt(comparison, 0.45)).toBe(`${comparison}-moving`)
    }
  })

  await test.step('"Reset view" centres both dividers', async () => {
    await page.locator('#reset-view').click()
    await expect.poll(positions).toEqual([50, 50])
  })

  await test.step('a finished registration puts the result on the right of the result comparison only', async () => {
    await finishRegistration(page, releaseRegistration)
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')
    expect(await caption(page, 'result-moving')).toEqual({ text: 'Registered · on the fixed grid', variant: 'success' })
    expect(await panelAt('result', 0.25)).toBe('result-fixed')
    expect(await panelAt('result', 0.75)).toBe('result-moving')
    // The inputs comparison still compares the inputs.
    expect(await volumeName(page, 'inputs-moving')).toContain('CT_2D_head_moving')
    expect(await caption(page, 'inputs-moving')).toEqual({ text: 'Moving · CT_2D_head_moving.mha', variant: 'brand' })
    expect(await volumeName(page, 'result-fixed')).toContain('CT_2D_head_fixed')
    for (const role of PANEL_ROLES) {
      expect(await volumeCount(page, role), role).toBe(1)
      expect(await crosshairWidth(page, role), role).toBe(0)
    }
  })

  await test.step('the result switch brings the moving image back on the right', async () => {
    await page.locator('#show-result').click()
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('CT_2D_head_moving')
    expect(await caption(page, 'result-moving')).toEqual({ text: 'Moving · CT_2D_head_moving.mha', variant: 'brand' })
  })

  expect(pageErrors).toEqual([])
})
