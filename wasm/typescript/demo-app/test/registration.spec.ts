// The registration panel and the runs it reports on: the run every loaded
// or reloaded pair starts on its own, the "Registration options" details
// with the resolutions and pixel budget pickers, the Cancel button beside
// Register, and the summary card a finished run fills with the stages, the elapsed
// time, the fixed-to-moving matrix and offset, and a copy button for the
// elastix parameter JSON. Elements are found by their stable ids; the store
// is read through `window.__demo` with the helpers in test/helpers.ts.
import { expect, test, type Page } from '@playwright/test'
import type WaCopyButton from '@awesome.me/webawesome/dist/components/copy-button/copy-button.js'
import type WaDetails from '@awesome.me/webawesome/dist/components/details/details.js'

import {
  LOAD_TIMEOUT,
  LOAD_TIMEOUT_3D,
  MNI_SAMPLE_BUTTON,
  REGISTRATION_TIMEOUT,
  TAILBUD_2D_MOVING,
  TAILBUD_2D_SAMPLE_BUTTON,
  collectPageErrors,
  holdRegistration,
  imageFacts,
  isDisabled,
  selectValue,
  statusText,
  switchState,
  volumeCount,
  volumeName,
  loadSample,
  waitForResult,
} from './helpers'
import { PANEL_ROLES } from '../src/viewer/comparison-options'

const MIB = 1024 * 1024
const DEFAULT_BUDGET = 50 * MIB

/** The parts of the store the panel renders from. */
interface RegistrationFacts {
  registering: boolean
  reloading: boolean
  numberOfResolutions: number
  budgetBytes: number
  hasResult: boolean
  /** The resolutions the current result was computed with, if any. */
  resultResolutions?: number
  /** The elastix parameter maps of the current result, pretty-printed, if any. */
  parametersText?: string
}

function registrationFacts(page: Page): Promise<RegistrationFacts | undefined> {
  return page.evaluate(() => {
    const state = window.__demo?.state?.state
    if (!state) {
      return undefined
    }
    return {
      registering: state.registering,
      reloading: state.reloading,
      numberOfResolutions: state.numberOfResolutions,
      budgetBytes: state.budgetBytes,
      hasResult: state.result !== undefined,
      resultResolutions: state.result?.numberOfResolutions,
      parametersText: state.result ? JSON.stringify(state.result.transformParameterObject, null, 2) : undefined,
    }
  })
}

/** Choose `value` in the `wa-select` with `id` through the UI, which is what fires `change`. */
async function pick(page: Page, id: string, value: string): Promise<void> {
  await page.locator(`#${id}`).click()
  await page.locator(`#${id} wa-option[value="${value}"]`).click()
  await expect.poll(() => selectValue(page.locator(`#${id}`))).toBe(value)
}

/** Open the "Registration options" details by its header, as a user would. */
async function openOptions(page: Page): Promise<void> {
  const details = page.locator('#registration-options')
  if (!(await details.evaluate((element: WaDetails) => element.open))) {
    await details.locator('[slot="summary"]').click()
  }
  await expect.poll(() => details.evaluate((element: WaDetails) => element.open)).toBe(true)
  await expect(page.locator('#resolutions')).toBeVisible()
}


/** The summary rows of the card, keyed by their `data-field`. */
function summaryRows(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('#registration-summary-list .summary-row')].map((row) => [
        row.dataset.field,
        row.querySelector('dd')?.textContent ?? '',
      ]),
    ),
  )
}

/** The matrix table's body: one array of cell texts per row, the offset last. */
function matrixCells(page: Page): Promise<string[][]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('#registration-matrix tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''),
    ),
  )
}

/** Wait for the run under way to finish with a result computed at `resolutions`. */
async function resultAt(page: Page, resolutions: number): Promise<void> {
  await expect
    .poll(async () => (await registrationFacts(page))?.resultResolutions, {
      message: `registration at ${resolutions} resolutions should finish`,
      timeout: REGISTRATION_TIMEOUT,
    })
    .toBe(resolutions)
  await expect.poll(async () => (await registrationFacts(page))?.registering).toBe(false)
}

/** The status line of a run under way: its stage and the running elapsed time. */
const RUNNING_STATUS = /translation → rigid → affine.*… \d+\.\d s$/

test('registers each pair on load, exposes the options, summarizes each run, and re-registers at a new budget', async ({
  page,
  context,
}) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const register = page.locator('#register')
  const showResult = page.locator('#show-result')
  const cancel = page.locator('#cancel-registration')
  const summary = page.locator('#registration-summary')
  let releaseRegistration = await holdRegistration(page)

  await test.step('load the 2D tailbud pair: a run at the defaults starts right away, with Cancel enabled and no summary', async () => {
    await page.goto('./')
    await loadSample(page, TAILBUD_2D_SAMPLE_BUTTON, LOAD_TIMEOUT)
    expect(await registrationFacts(page)).toMatchObject({
      registering: true,
      reloading: false,
      numberOfResolutions: 3,
      budgetBytes: DEFAULT_BUDGET,
      hasResult: false,
    })
    await expect(page.locator('#registration-options')).toBeVisible()
    await expect(summary).toBeHidden()
    expect(await isDisabled(cancel)).toBe(false)
    expect(await isDisabled(register)).toBe(true)
    expect(await statusText(page)).toMatch(RUNNING_STATUS)
  })

  await test.step('the run finishes at 3 resolutions and the options open up', async () => {
    await releaseRegistration()
    await resultAt(page, 3)
    await expect(summary).toBeVisible()
    expect(await isDisabled(cancel)).toBe(true)
    expect(await isDisabled(register)).toBe(false)

    await openOptions(page)
    expect(await selectValue(page.locator('#resolutions'))).toBe('3')
    expect(await selectValue(page.locator('#pixel-budget'))).toBe(String(DEFAULT_BUDGET))
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(false)
    await expect(page.locator('#pixel-budget wa-option')).toHaveText(['10 MB', '25 MB', '50 MB', '100 MB'])
    await expect(page.locator('#resolutions wa-option')).toHaveText(['2', '3', '4', '5'])
  })

  await test.step('choosing 2 resolutions reaches the store, and Register runs again with them', async () => {
    await pick(page, 'resolutions', '2')
    await expect.poll(async () => (await registrationFacts(page))?.numberOfResolutions).toBe(2)
    await register.click()
    await resultAt(page, 2)
  })

  await test.step('the summary card shows the stages, resolutions, time, and a 2×3 matrix with finite entries', async () => {
    await expect(summary).toBeVisible()
    await expect(page.locator('#registration-summary-brief')).toHaveText(/^translation → rigid → affine in \d+\.\d s$/)
    const rows = await summaryRows(page)
    expect(rows).toMatchObject({
      stages: 'translation → rigid → affine',
      resolutions: '2',
      axes: 'y, x',
    })
    expect(rows.elapsed).toMatch(/^\d+\.\d s$/)
    await expect(page.locator('#registration-matrix thead th')).toHaveText(['', 'y', 'x', 'offset'])
    const cells = await matrixCells(page)
    expect(cells).toHaveLength(2)
    for (const row of cells) {
      expect(row).toHaveLength(3)
      for (const cell of row) {
        expect(Number.isFinite(Number(cell)), `matrix cell ${cell}`).toBe(true)
      }
    }
    // Two frames 40 min apart differ by a modest rotation and shift, so the matrix stays near the identity.
    expect(Math.abs(Number(cells[0]![0]) - 1)).toBeLessThan(0.5)
    expect(Math.abs(Number(cells[1]![1]) - 1)).toBeLessThan(0.5)
  })

  await test.step('the copy button carries the elastix parameter JSON and puts it on the clipboard', async () => {
    const copyButton = page.locator('#copy-transform-parameters')
    const facts = (await registrationFacts(page))!
    expect(await copyButton.evaluate((element: WaCopyButton) => element.value)).toBe(facts.parametersText)
    const maps = JSON.parse(facts.parametersText!) as { Transform?: string[] }[]
    expect(maps.map((map) => map.Transform?.[0])).toEqual(['TranslationTransform', 'EulerTransform', 'AffineTransform'])

    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await copyButton.evaluate((element: WaCopyButton) => {
      element.addEventListener('wa-copy', () => element.setAttribute('data-copied', 'yes'), { once: true })
      element.addEventListener('wa-error', () => element.setAttribute('data-copied', 'no'), { once: true })
    })
    await copyButton.click()
    await expect(copyButton).toHaveAttribute('data-copied', 'yes')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(facts.parametersText)
  })

  await test.step('a re-run at 4 resolutions replaces the result and keeps the result switch on', async () => {
    expect((await switchState(showResult)).checked).toBe(true)

    await pick(page, 'resolutions', '4')
    await register.click()
    await resultAt(page, 4)

    expect((await summaryRows(page)).resolutions).toBe('4')
    expect(await switchState(showResult)).toEqual({ disabled: false, checked: true })
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')
    expect(await volumeName(page, 'inputs-moving')).toContain(TAILBUD_2D_MOVING)
    expect(await isDisabled(cancel)).toBe(true)
  })

  await test.step('choosing a 10 MB budget reloads both inputs, drops the result, resets the switch, and registers again', async () => {
    releaseRegistration = await holdRegistration(page)
    await pick(page, 'pixel-budget', String(10 * MIB))
    // The tailbud planes reload in well under a second, so the transient
    // `reloading` flag cannot be caught; the committed budget marks the end.
    await expect
      .poll(async () => (await registrationFacts(page))?.budgetBytes, { message: 'the reload should finish', timeout: LOAD_TIMEOUT })
      .toBe(10 * MIB)
    await expect
      .poll(async () => (await registrationFacts(page))?.registering, { message: 'the reloaded pair should start registering' })
      .toBe(true)
    expect(await registrationFacts(page)).toMatchObject({ reloading: false, hasResult: false, numberOfResolutions: 4 })
    for (const role of ['fixed', 'moving'] as const) {
      const facts = (await imageFacts(page, 'store', role))!
      expect(facts.budgetBytes).toBe(10 * MIB)
      // The planes are far under 10 MB, so the level does not change.
      expect(facts.scaleIndex).toBe(0)
    }
    await expect(summary).toBeHidden()
    expect(await switchState(showResult)).toEqual({ disabled: true, checked: false })
    await expect.poll(() => volumeName(page, 'result-moving')).toContain(TAILBUD_2D_MOVING)
    for (const role of PANEL_ROLES) {
      await expect.poll(() => volumeCount(page, role)).toBe(1)
    }
    expect(await selectValue(page.locator('#pixel-budget'))).toBe(String(10 * MIB))
    expect(await statusText(page)).toMatch(RUNNING_STATUS)
    expect(await isDisabled(register)).toBe(true)
    expect(await isDisabled(cancel)).toBe(false)

    await releaseRegistration()
    await resultAt(page, 4)
    expect(await switchState(showResult)).toEqual({ disabled: false, checked: true })
    expect(await isDisabled(register)).toBe(false)
  })

  expect(pageErrors).toEqual([])
})

test('a budget reload that fails keeps the pair, the budget, and the result, and starts no run', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  await page.goto('./')
  await loadSample(page, TAILBUD_2D_SAMPLE_BUTTON, LOAD_TIMEOUT)
  await waitForResult(page)
  const before = (await registrationFacts(page))!

  // The moving plane's store can no longer be read, so the reload fails part-way.
  await page.route(`**/samples/${TAILBUD_2D_MOVING}/**`, (route) => route.fulfill({ status: 404, body: 'Not Found' }))
  await openOptions(page)
  // Not `pick`: the failed reload puts the picker back on 50 MB within a frame or two.
  await page.locator('#pixel-budget').click()
  await page.locator(`#pixel-budget wa-option[value="${10 * MIB}"]`).click()
  await expect
    .poll(() => statusText(page), { message: 'the reload should fail', timeout: LOAD_TIMEOUT })
    .toMatch(/^Could not reload the images at 10\.0 MB: .*The pair loaded at 50\.0 MB is kept\.$/)
  await expect(page.locator('#status')).toHaveAttribute('data-variant', 'danger')

  expect(await registrationFacts(page)).toEqual({ ...before, registering: false, reloading: false })
  expect(await selectValue(page.locator('#pixel-budget'))).toBe(String(DEFAULT_BUDGET))
  expect(await isDisabled(page.locator('#register'))).toBe(false)
  expect(await switchState(page.locator('#show-result'))).toEqual({ disabled: false, checked: true })
  await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')

  expect(pageErrors).toEqual([])
})

test('cancels the run a 3D pair starts mid-way and downsamples the pair under a smaller budget', async ({ page }) => {
  test.slow()
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const register = page.locator('#register')
  const cancel = page.locator('#cancel-registration')

  /** Cancel the run under way and wait for the store to return to idle. */
  async function cancelRun(): Promise<void> {
    await cancel.click()
    await expect.poll(async () => (await registrationFacts(page))?.registering, { message: 'the run should end' }).toBe(false)
  }

  await test.step('load the 3D MNI pair at the default budget: full resolution, registering', async () => {
    await page.goto('./')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)
    expect((await imageFacts(page, 'store', 'fixed'))!.scaleIndex).toBe(0)
    // The full-resolution volumes keep elastix busy for seconds.
    expect(await registrationFacts(page)).toMatchObject({ registering: true, hasResult: false })
  })

  await test.step('Cancel stops the run, leaves no result, and returns the controls to idle', async () => {
    expect(await isDisabled(cancel)).toBe(false)
    expect(await isDisabled(register)).toBe(true)
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(true)
    expect(await isDisabled(page.locator('#resolutions'))).toBe(true)

    await cancelRun()
    expect(await registrationFacts(page)).toMatchObject({ hasResult: false, reloading: false })
    await expect.poll(() => statusText(page)).toMatch(/^Registration cancelled after \d+\.\d s\. Press Register to start again\.$/)
    expect(await isDisabled(cancel)).toBe(true)
    expect(await isDisabled(register)).toBe(false)
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(false)
    await expect(page.locator('#registration-summary')).toBeHidden()
    expect(await switchState(page.locator('#show-result'))).toEqual({ disabled: true, checked: false })
  })

  await test.step('a 10 MB budget reloads both volumes at a coarser level that fits and registers them', async () => {
    // Parked, so the reloaded pair's run is still under way when checked.
    const releaseRegistration = await holdRegistration(page)
    await openOptions(page)
    await pick(page, 'pixel-budget', String(10 * MIB))
    await expect
      .poll(async () => (await registrationFacts(page))?.budgetBytes, { message: 'the reload should finish', timeout: LOAD_TIMEOUT_3D })
      .toBe(10 * MIB)
    await expect.poll(async () => (await registrationFacts(page))?.reloading).toBe(false)
    for (const role of ['fixed', 'moving'] as const) {
      const facts = (await imageFacts(page, 'store', role))!
      expect(facts.dimension).toBe(3)
      expect(facts.budgetBytes).toBe(10 * MIB)
      expect(facts.registrationBytes).toBeLessThanOrEqual(10 * MIB)
    }
    expect((await imageFacts(page, 'store', 'fixed'))!.scaleIndex).toBeGreaterThanOrEqual(1)
    await expect.poll(() => volumeCount(page, 'inputs-fixed')).toBe(1)
    await expect.poll(() => volumeCount(page, 'inputs-moving')).toBe(1)
    await expect
      .poll(async () => (await registrationFacts(page))?.registering, { message: 'the reloaded pair should start registering' })
      .toBe(true)
    // Cancelled: the budget picker is disabled while a run is under way.
    await cancelRun()
    await releaseRegistration()
  })

  await test.step('back at 50 MB the pair reloads at full resolution', async () => {
    // Parked for good: the full-resolution run it starts has nothing left to show.
    await holdRegistration(page)
    await pick(page, 'pixel-budget', String(DEFAULT_BUDGET))
    await expect
      .poll(async () => (await registrationFacts(page))?.budgetBytes, { message: 'the reload should finish', timeout: LOAD_TIMEOUT_3D })
      .toBe(DEFAULT_BUDGET)
    await expect.poll(async () => (await registrationFacts(page))?.reloading).toBe(false)
    expect((await imageFacts(page, 'store', 'fixed'))!.scaleIndex).toBe(0)
  })

  expect(pageErrors).toEqual([])
})
