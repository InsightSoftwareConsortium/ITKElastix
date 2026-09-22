// End-to-end smoke test: the whole prototype flow in one browser session,
// from the splash dialog to the two downloads in their default formats.
// Elements are found by their stable ids; WebAwesome and niivue state is
// read through their documented properties (and `window.__demo`, published
// by src/main.ts and src/viewer/panel.ts) with the helpers in
// test/helpers.ts, never through shadow DOM structure.
import { expect, test } from '@playwright/test'

import {
  CT_SAMPLE_BUTTON,
  LOAD_TIMEOUT,
  REGISTRATION_TIMEOUT,
  clickForDownload,
  collectPageErrors,
  loadSample,
  selectValue,
  switchState,
  volumeName,
} from './helpers'

test('loads the 2D CT head pair, registers it, and downloads the result and transform', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  const showResult = page.locator('#show-result')

  await test.step('load the sample pair from the splash dialog', async () => {
    await page.goto('./')
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    expect(await switchState(showResult)).toEqual({ disabled: true, checked: false })
  })

  await test.step('register and compare the result with the moving image', async () => {
    const fixedName = await volumeName(page, 'fixed')
    const movingName = await volumeName(page, 'moving')
    expect(fixedName).toContain('CT_2D_head_fixed')
    expect(movingName).toContain('CT_2D_head_moving')

    await page.locator('#register').click()
    await expect
      .poll(async () => (await switchState(showResult)).disabled, {
        message: 'registration should finish and enable the "Show registered result" switch',
        timeout: REGISTRATION_TIMEOUT,
      })
      .toBe(false)

    // A finished registration switches the moving panel to the result on its
    // own (see `resultReady` in src/state.ts); the switch then compares.
    expect((await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(false)
    await expect.poll(() => volumeName(page, 'moving')).toBe(movingName)

    await showResult.click()
    await expect.poll(async () => (await switchState(showResult)).checked).toBe(true)
    await expect.poll(() => volumeName(page, 'moving')).toContain('registered')

    // The fixed panel is never touched.
    expect(await volumeName(page, 'fixed')).toBe(fixedName)
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
