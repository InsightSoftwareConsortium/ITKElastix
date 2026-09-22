// End-to-end tests for the ingest paths the bundled samples can exercise:
// the 3D sample under the default and a forced pixel budget, the URL fields,
// the file pickers, and the pair check with the swap button. Assertions are
// read from the app state (`window.__demo.state`, published by src/main.ts)
// and the splash's pending slots (`window.__demo.splash`) rather than from
// rendered text wherever the state carries the fact; only the danger callout
// and the slot summaries are checked as the user sees them. The OZX and
// OME-TIFF round trips live in test/outputs.spec.ts, which downloads their
// fixtures first; the page helpers both files use are in test/helpers.ts.
import { expect, test as base, type Locator, type Page } from '@playwright/test'

import { BUDGET_QUERY_PARAM, PIXEL_BUDGET_BYTES } from '../src/io/scale-select'
import type { SlotRole } from '../src/ui/splash-slots'
import {
  CT_FIXED,
  CT_MOVING,
  LOAD_TIMEOUT_3D,
  MNI_FIXED,
  MNI_MOVING,
  MNI_SAMPLE_BUTTON,
  SAMPLES_DIR,
  collectPageErrors,
  imageFacts,
  isDisabled,
  loadSample,
  splashDialog,
  start,
  volumeCount,
  waitForSlot,
} from './helpers'

/** Pixel budget, in MiB, small enough to force the 3D sample down a pyramid level. */
const SMALL_BUDGET_MIB = 4
const SMALL_BUDGET_BYTES = SMALL_BUDGET_MIB * 1024 * 1024

/** Every test fails if the page threw an uncaught error. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      collectPageErrors(page, errors)
      await use(errors)
      expect(errors, 'the page should not throw').toEqual([])
    },
    { auto: true },
  ],
})

/** Names of the pair the app store holds; undefined entries for empty slots. */
function storeNames(page: Page): Promise<{ fixed?: string; moving?: string }> {
  return page.evaluate(() => {
    const state = window.__demo?.state?.state
    return { fixed: state?.fixed?.name, moving: state?.moving?.name }
  })
}

/** The value cell of one summary row under a splash slot. */
function summaryValue(page: Page, role: SlotRole, field: string): Locator {
  return page.locator(`#${role}-summary .summary-row[data-field="${field}"] dd`)
}

/** Type `url` into the slot's URL field and load it. */
async function loadUrl(page: Page, role: SlotRole, url: string, submit: 'button' | 'enter'): Promise<void> {
  // `fill` must target the input inside the wa-input's shadow root; the
  // host element is not a form control.
  const field = page.locator(`#${role}-url input`)
  await field.fill(url)
  if (submit === 'enter') {
    await field.press('Enter')
  } else {
    const load = page.locator(`#${role}-url-load`)
    await expect.poll(() => isDisabled(load), { message: 'typing a URL should enable Load' }).toBe(false)
    await load.click()
  }
}

/** Pick `fileName` from the samples directory through the slot's hidden file input. */
async function pickFile(page: Page, role: SlotRole, fileName: string): Promise<void> {
  await page.locator(`#${role}-file`).setInputFiles(`${SAMPLES_DIR}${fileName}`)
}

test.describe('3D MNI sample', () => {
  test('loads both volumes at full resolution under the default budget', async ({ page }) => {
    await page.goto('./')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)

    const fixed = await imageFacts(page, 'store', 'fixed')
    const moving = await imageFacts(page, 'store', 'moving')
    expect(fixed?.name).toBe(MNI_FIXED)
    expect(moving?.name).toBe(MNI_MOVING)
    for (const image of [fixed, moving]) {
      expect(image?.dimension).toBe(3)
      expect(image?.size).toHaveLength(3)
      expect(image?.kind).toBe('itk')
      expect(image?.format).toBe('ITK')
      expect(image?.scaleIndex).toBe(0)
      expect(image?.budgetBytes).toBe(PIXEL_BUDGET_BYTES)
      expect(image?.registrationBytes).toBeGreaterThan(SMALL_BUDGET_BYTES)
      expect(image?.registrationBytes).toBeLessThanOrEqual(PIXEL_BUDGET_BYTES)
    }
  })

  test(`downsamples both volumes under ?${BUDGET_QUERY_PARAM}=${SMALL_BUDGET_MIB}`, async ({ page }) => {
    await page.goto(`./?${BUDGET_QUERY_PARAM}=${SMALL_BUDGET_MIB}`)
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)

    const fixed = await imageFacts(page, 'store', 'fixed')
    const moving = await imageFacts(page, 'store', 'moving')
    expect(fixed?.name).toBe(MNI_FIXED)
    expect(moving?.name).toBe(MNI_MOVING)
    for (const image of [fixed, moving]) {
      // Both templates exceed 4 MiB at full resolution, so each needs at
      // least one extra pyramid level and registers from a coarser one.
      expect(image?.dimension).toBe(3)
      expect(image?.budgetBytes).toBe(SMALL_BUDGET_BYTES)
      expect(image?.levels).toBeGreaterThanOrEqual(2)
      expect(image?.scaleIndex).toBeGreaterThanOrEqual(1)
      expect(image?.registrationBytes).toBeLessThanOrEqual(SMALL_BUDGET_BYTES)
    }
  })
})

test('loads the CT pair from the URL fields, by the Load button and by Enter', async ({ page, baseURL }) => {
  await page.goto('./')
  await expect(splashDialog(page)).toBeVisible()
  const startButton = page.locator('#start-registration-inputs')
  expect(await isDisabled(startButton)).toBe(true)

  // The dev server's own copies of the bundled samples.
  await loadUrl(page, 'fixed', new URL(`samples/${CT_FIXED}`, baseURL).href, 'button')
  await waitForSlot(page, 'fixed', CT_FIXED)
  expect(await isDisabled(startButton), 'one slot is not enough to start').toBe(true)
  expect(await storeNames(page), 'a pending slot must not reach the store').toEqual({})

  await loadUrl(page, 'moving', new URL(`samples/${CT_MOVING}`, baseURL).href, 'enter')
  await waitForSlot(page, 'moving', CT_MOVING)
  await expect(page.locator('#splash-error')).toBeHidden()

  await start(page)
  const fixed = await imageFacts(page, 'store', 'fixed')
  const moving = await imageFacts(page, 'store', 'moving')
  expect(fixed).toMatchObject({ name: CT_FIXED, kind: 'itk', format: 'ITK', dimension: 2, scaleIndex: 0 })
  expect(moving).toMatchObject({ name: CT_MOVING, kind: 'itk', format: 'ITK', dimension: 2, scaleIndex: 0 })
  expect(fixed?.size).toEqual(moving?.size)
  await expect.poll(() => volumeCount(page, 'fixed')).toBe(1)
  await expect.poll(() => volumeCount(page, 'moving')).toBe(1)
})

test('loads the CT pair from the file pickers', async ({ page }) => {
  await page.goto('./')
  await expect(splashDialog(page)).toBeVisible()

  await pickFile(page, 'fixed', CT_FIXED)
  await waitForSlot(page, 'fixed', CT_FIXED)
  await pickFile(page, 'moving', CT_MOVING)
  await waitForSlot(page, 'moving', CT_MOVING)
  await expect(page.locator('#splash-error')).toBeHidden()

  // The input is reset after each pick so the same file can be chosen again.
  expect(await page.locator('#fixed-file').evaluate((input: HTMLInputElement) => input.value)).toBe('')

  await start(page)
  const fixed = await imageFacts(page, 'store', 'fixed')
  const moving = await imageFacts(page, 'store', 'moving')
  expect(fixed).toMatchObject({ name: CT_FIXED, kind: 'itk', format: 'ITK', dimension: 2, scaleIndex: 0 })
  expect(moving).toMatchObject({ name: CT_MOVING, kind: 'itk', format: 'ITK', dimension: 2, scaleIndex: 0 })
  expect(fixed?.budgetBytes).toBe(PIXEL_BUDGET_BYTES)
  await expect.poll(() => volumeCount(page, 'fixed')).toBe(1)
  await expect.poll(() => volumeCount(page, 'moving')).toBe(1)
})

test('rejects a 2D fixed with a 3D moving image, keeps the dialog open, and swaps the slots', async ({ page }) => {
  await page.goto('./')
  await expect(splashDialog(page)).toBeVisible()
  const callout = page.locator('#splash-error')
  const startButton = page.locator('#start-registration-inputs')
  const swap = page.locator('#swap-images')

  await pickFile(page, 'fixed', CT_FIXED)
  await waitForSlot(page, 'fixed', CT_FIXED)
  await expect(callout).toBeHidden()

  await pickFile(page, 'moving', MNI_MOVING)
  await waitForSlot(page, 'moving', MNI_MOVING, LOAD_TIMEOUT_3D)

  await test.step('the pair check shows in the danger callout as soon as both slots are filled', async () => {
    expect(await imageFacts(page, 'splash', 'fixed')).toMatchObject({ name: CT_FIXED, dimension: 2 })
    expect(await imageFacts(page, 'splash', 'moving')).toMatchObject({ name: MNI_MOVING, dimension: 3 })

    await expect(callout).toBeVisible()
    await expect(callout).toHaveAttribute('variant', 'danger')
    await expect(callout).toContainText('dimension')
    await expect(callout).toContainText(`${CT_FIXED} is 2D but the moving image ${MNI_MOVING} is 3D`)

    await expect(splashDialog(page)).toBeVisible()
    expect(await isDisabled(startButton), 'Start must stay disabled for a mismatched pair').toBe(true)
    expect(await storeNames(page), 'the app must not receive the pair').toEqual({})
  })

  await test.step('swapping exchanges the slots, their summaries, and the message', async () => {
    expect(await isDisabled(swap)).toBe(false)
    await expect(summaryValue(page, 'fixed', 'name')).toHaveText(CT_FIXED)
    await expect(summaryValue(page, 'moving', 'name')).toHaveText(MNI_MOVING)

    await swap.click()

    await expect.poll(async () => (await imageFacts(page, 'splash', 'fixed'))?.name).toBe(MNI_MOVING)
    expect(await imageFacts(page, 'splash', 'fixed')).toMatchObject({ name: MNI_MOVING, dimension: 3 })
    expect(await imageFacts(page, 'splash', 'moving')).toMatchObject({ name: CT_FIXED, dimension: 2 })
    await expect(summaryValue(page, 'fixed', 'name')).toHaveText(MNI_MOVING)
    await expect(summaryValue(page, 'fixed', 'dimension')).toHaveText('3D')
    await expect(summaryValue(page, 'moving', 'name')).toHaveText(CT_FIXED)
    await expect(summaryValue(page, 'moving', 'dimension')).toHaveText('2D')

    // Still mismatched, now the other way round.
    await expect(callout).toBeVisible()
    await expect(callout).toContainText(`${MNI_MOVING} is 3D but the moving image ${CT_FIXED} is 2D`)
    await expect(splashDialog(page)).toBeVisible()
    expect(await isDisabled(startButton)).toBe(true)
    expect(await storeNames(page)).toEqual({})
  })

  await test.step('replacing the 3D image with the 2D moving slice clears the check', async () => {
    await swap.click()
    await expect.poll(async () => (await imageFacts(page, 'splash', 'fixed'))?.name).toBe(CT_FIXED)
    await pickFile(page, 'moving', CT_MOVING)
    await waitForSlot(page, 'moving', CT_MOVING)
    await expect(callout).toBeHidden()
    await expect.poll(() => isDisabled(startButton)).toBe(false)
  })
})
