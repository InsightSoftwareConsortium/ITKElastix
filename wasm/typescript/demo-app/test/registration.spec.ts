// The registration panel: the "Registration options" details with the
// resolutions and pixel budget pickers, the Cancel button beside Register,
// and the summary card a finished run fills with the stages, the elapsed
// time, the fixed-to-moving matrix and offset, and a copy button for the
// elastix parameter JSON. Elements are found by their stable ids; the store
// is read through `window.__demo` with the helpers in test/helpers.ts.
import { expect, test, type Page } from '@playwright/test'
import type WaCopyButton from '@awesome.me/webawesome/dist/components/copy-button/copy-button.js'
import type WaDetails from '@awesome.me/webawesome/dist/components/details/details.js'

import {
  CT_SAMPLE_BUTTON,
  LOAD_TIMEOUT,
  LOAD_TIMEOUT_3D,
  MNI_SAMPLE_BUTTON,
  REGISTRATION_TIMEOUT,
  collectPageErrors,
  imageFacts,
  isDisabled,
  selectValue,
  switchState,
  volumeCount,
  volumeFacts,
  volumeName,
  loadSample,
} from './helpers'

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

/** The text of the neutral status line, or of the callout when one is shown. */
async function statusText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const message = document.querySelector<HTMLElement>('#status-message')
    const callout = document.querySelector<HTMLElement>('#status-callout')
    const shown = message?.hidden ? callout : message
    return shown?.textContent?.trim() ?? ''
  })
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

/** Wait for a run to finish with a result computed at `resolutions`. */
async function registerAt(page: Page, resolutions: number): Promise<void> {
  await page.locator('#register').click()
  await expect
    .poll(async () => (await registrationFacts(page))?.resultResolutions, {
      message: `registration at ${resolutions} resolutions should finish`,
      timeout: REGISTRATION_TIMEOUT,
    })
    .toBe(resolutions)
  await expect.poll(async () => (await registrationFacts(page))?.registering).toBe(false)
}

test('exposes the options, summarizes each run, keeps the toggles across a re-run, and reloads at a new budget', async ({
  page,
  context,
}) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const showResult = page.locator('#show-result')
  const overlayToggle = page.locator('#overlay-toggle')
  const cancel = page.locator('#cancel-registration')
  const summary = page.locator('#registration-summary')

  await test.step('load the 2D CT pair: defaults in the pickers, Cancel disabled, no summary', async () => {
    await page.goto('/')
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    expect(await registrationFacts(page)).toMatchObject({
      registering: false,
      reloading: false,
      numberOfResolutions: 3,
      budgetBytes: DEFAULT_BUDGET,
      hasResult: false,
    })
    await expect(page.locator('#registration-options')).toBeVisible()
    await expect(summary).toBeHidden()
    expect(await isDisabled(cancel)).toBe(true)

    await openOptions(page)
    expect(await selectValue(page.locator('#resolutions'))).toBe('3')
    expect(await selectValue(page.locator('#pixel-budget'))).toBe(String(DEFAULT_BUDGET))
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(false)
    await expect(page.locator('#pixel-budget wa-option')).toHaveText(['10 MB', '25 MB', '50 MB', '100 MB'])
    await expect(page.locator('#resolutions wa-option')).toHaveText(['2', '3', '4', '5'])
  })

  await test.step('choosing 2 resolutions reaches the store and the run', async () => {
    await pick(page, 'resolutions', '2')
    await expect.poll(async () => (await registrationFacts(page))?.numberOfResolutions).toBe(2)
    await registerAt(page, 2)
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
    // A registration of two nearby CT slices is close to the identity.
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

  await test.step('a re-run at 4 resolutions replaces the result and keeps the result and overlay toggles', async () => {
    await overlayToggle.click()
    await expect.poll(() => volumeCount(page, 'fixed')).toBe(2)
    expect((await switchState(showResult)).checked).toBe(true)

    await pick(page, 'resolutions', '4')
    await registerAt(page, 4)

    expect((await summaryRows(page)).resolutions).toBe('4')
    expect(await switchState(showResult)).toEqual({ disabled: false, checked: true })
    expect(await switchState(overlayToggle)).toEqual({ disabled: false, checked: true })
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')
    await expect.poll(async () => (await volumeFacts(page, 'fixed'))?.map((volume) => volume.name)).toEqual([
      expect.stringContaining('CT_2D_head_fixed'),
      expect.stringContaining('registered'),
    ])
    expect(await isDisabled(cancel)).toBe(true)
  })

  await test.step('choosing a 10 MB budget reloads both inputs, drops the result, and resets the toggles', async () => {
    await pick(page, 'pixel-budget', String(10 * MIB))
    // The CT slices reload in well under a second, so the transient
    // `reloading` flag cannot be caught; the committed budget marks the end.
    await expect
      .poll(async () => (await registrationFacts(page))?.budgetBytes, { message: 'the reload should finish', timeout: LOAD_TIMEOUT })
      .toBe(10 * MIB)
    await expect.poll(async () => (await registrationFacts(page))?.reloading).toBe(false)
    expect(await registrationFacts(page)).toMatchObject({ hasResult: false, numberOfResolutions: 4 })
    for (const role of ['fixed', 'moving'] as const) {
      const facts = (await imageFacts(page, 'store', role))!
      expect(facts.budgetBytes).toBe(10 * MIB)
      // The CT slices are far under 10 MB, so the level does not change.
      expect(facts.scaleIndex).toBe(0)
    }
    await expect(summary).toBeHidden()
    expect(await switchState(showResult)).toEqual({ disabled: true, checked: false })
    expect((await switchState(overlayToggle)).checked).toBe(false)
    await expect.poll(() => volumeCount(page, 'fixed')).toBe(1)
    await expect.poll(() => volumeCount(page, 'moving')).toBe(1)
    expect(await selectValue(page.locator('#pixel-budget'))).toBe(String(10 * MIB))
    await expect.poll(() => statusText(page)).toMatch(/^Reloaded CT_2D_head_fixed\.mha \(fixed\) and CT_2D_head_moving\.mha \(moving\) at a 10\.0 MB budget/)
    expect(await isDisabled(page.locator('#register'))).toBe(false)
  })

  expect(pageErrors).toEqual([])
})

test('downsamples the 3D pair under a smaller budget and cancels a run mid-way', async ({ page }) => {
  test.slow()
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const register = page.locator('#register')
  const cancel = page.locator('#cancel-registration')

  await test.step('load the 3D MNI pair at the default budget: full resolution', async () => {
    await page.goto('/')
    await loadSample(page, MNI_SAMPLE_BUTTON, LOAD_TIMEOUT_3D)
    expect((await imageFacts(page, 'store', 'fixed'))!.scaleIndex).toBe(0)
  })

  await test.step('a 10 MB budget reloads both volumes at a coarser level that fits', async () => {
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
    await expect.poll(() => volumeCount(page, 'fixed')).toBe(1)
    await expect.poll(() => volumeCount(page, 'moving')).toBe(1)
  })

  await test.step('Cancel stops the run, leaves no result, and returns the controls to idle', async () => {
    expect(await isDisabled(cancel)).toBe(true)
    await register.click()
    await expect.poll(() => isDisabled(cancel), { message: 'Cancel should enable once the run starts' }).toBe(false)
    expect(await isDisabled(register)).toBe(true)
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(true)
    expect(await isDisabled(page.locator('#resolutions'))).toBe(true)

    await cancel.click()
    await expect.poll(async () => (await registrationFacts(page))?.registering, { message: 'the run should end' }).toBe(false)
    expect(await registrationFacts(page)).toMatchObject({ hasResult: false, reloading: false })
    await expect.poll(() => statusText(page)).toMatch(/^Registration cancelled after \d+\.\d s\. Press Register to start again\.$/)
    expect(await isDisabled(cancel)).toBe(true)
    expect(await isDisabled(register)).toBe(false)
    expect(await isDisabled(page.locator('#pixel-budget'))).toBe(false)
    await expect(page.locator('#registration-summary')).toBeHidden()
    expect(await switchState(page.locator('#show-result'))).toEqual({ disabled: true, checked: false })
  })

  await test.step('back at 50 MB the pair reloads at full resolution', async () => {
    await pick(page, 'pixel-budget', String(DEFAULT_BUDGET))
    await expect
      .poll(async () => (await registrationFacts(page))?.budgetBytes, { message: 'the reload should finish', timeout: LOAD_TIMEOUT_3D })
      .toBe(DEFAULT_BUDGET)
    await expect.poll(async () => (await registrationFacts(page))?.reloading).toBe(false)
    expect((await imageFacts(page, 'store', 'fixed'))!.scaleIndex).toBe(0)
  })

  expect(pageErrors).toEqual([])
})
