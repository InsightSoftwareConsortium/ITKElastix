// End-to-end smoke test: the whole prototype flow in one browser session,
// from the splash dialog through the registration it starts on its own to
// the two downloads in their default formats.
// Elements are found by their stable ids; WebAwesome and niivue state is
// read through their documented properties (and `window.__demo`, published
// by src/main.ts and src/viewer/panel.ts) with the helpers in
// test/helpers.ts, never through shadow DOM structure.
import { expect, test } from '@playwright/test'

import {
  LOAD_TIMEOUT,
  REGISTRATION_TIMEOUT,
  TAILBUD_2D_FIXED,
  TAILBUD_2D_MOVING,
  TAILBUD_2D_SAMPLE_BUTTON,
  clickForDownload,
  collectPageErrors,
  holdRegistration,
  isDisabled,
  isRegistering,
  loadSample,
  selectValue,
  switchState,
  volumeName,
} from './helpers'

test('loads the 2D zebrafish tailbud pair, registers it on its own, and downloads the result and transform', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  const showResult = page.locator('#show-result')
  const releaseRegistration = await holdRegistration(page)
  let fixedName: string | undefined
  let movingName: string | undefined

  await test.step('load the sample pair from the splash dialog: the registration starts right away', async () => {
    await page.goto('./')
    await loadSample(page, TAILBUD_2D_SAMPLE_BUTTON, LOAD_TIMEOUT)
    expect(await isRegistering(page)).toBe(true)
    expect(await isDisabled(page.locator('#register'))).toBe(true)
    expect(await isDisabled(page.locator('#cancel-registration'))).toBe(false)
    expect(await switchState(showResult)).toEqual({ disabled: true, checked: false })

    fixedName = await volumeName(page, 'inputs-fixed')
    movingName = await volumeName(page, 'inputs-moving')
    expect(fixedName).toContain(TAILBUD_2D_FIXED)
    expect(movingName).toContain(TAILBUD_2D_MOVING)
    // Until the run finishes, the result comparison repeats the inputs.
    expect(await volumeName(page, 'result-fixed')).toBe(fixedName)
    expect(await volumeName(page, 'result-moving')).toBe(movingName)
  })

  await test.step('the run finishes and the result compares with the moving image', async () => {
    await releaseRegistration()
    await expect
      .poll(async () => (await switchState(showResult)).disabled, {
        message: 'registration should finish and enable the "Show registered result" switch',
        timeout: REGISTRATION_TIMEOUT,
      })
      .toBe(false)

    // A finished registration switches the result comparison's moving side
    // to the result on its own (see `resultReady` in src/state.ts); the
    // switch then compares.
    expect((await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(false)
    await expect.poll(() => volumeName(page, 'result-moving')).toBe(movingName)

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'result-moving')).toContain('registered')

    // The inputs comparison and both fixed sides are never touched.
    expect(await volumeName(page, 'inputs-fixed')).toBe(fixedName)
    expect(await volumeName(page, 'inputs-moving')).toBe(movingName)
    expect(await volumeName(page, 'result-fixed')).toBe(fixedName)
  })

  await test.step('download the registered image and the transform in the default OME-Zarr formats', async () => {
    // The format pickers start on the OME-Zarr entries (see src/io/formats.ts);
    // test/outputs.spec.ts covers the other formats.
    expect(await selectValue(page.locator('#image-format'))).toBe('ozx')
    expect(await selectValue(page.locator('#transform-format'))).toBe('ozx-transform')

    const image = await clickForDownload(page, page.locator('#download-image'))
    expect(image.suggestedFilename()).toBe('registered.ome.zarr.ozx')
    expect(await image.failure()).toBeNull()

    const transform = await clickForDownload(page, page.locator('#download-transform'))
    expect(transform.suggestedFilename()).toBe('transform.ome.zarr.ozx')
    expect(await transform.failure()).toBeNull()
  })

  expect(pageErrors).toEqual([])
})
