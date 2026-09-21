// End-to-end smoke test: the whole prototype flow in one browser session,
// from the splash dialog to the two downloads. Elements are found by their
// stable ids; WebAwesome and niivue state is read through their documented
// properties (and `window.__demo`, published by src/main.ts and
// src/viewer/panel.ts), never through shadow DOM structure.
import { expect, test, type Locator, type Page } from '@playwright/test'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js'

type PanelRole = 'fixed' | 'moving'

/** Registering the 2D CT pair takes about a second locally; CI can be far slower. */
const REGISTRATION_TIMEOUT = 150_000
/** The bundled samples are small, but the ingest pipeline compiles wasm on first use. */
const LOAD_TIMEOUT = 60_000

/** Number of volumes the niivue instance of `panel` currently shows. */
function volumeCount(page: Page, panel: PanelRole): Promise<number | undefined> {
  return page.evaluate((role) => window.__demo?.[role]?.volumes.length, panel)
}

/** Name of the first volume the niivue instance of `panel` shows. */
function volumeName(page: Page, panel: PanelRole): Promise<string | undefined> {
  return page.evaluate((role) => window.__demo?.[role]?.volumes[0]?.name, panel)
}

/**
 * `wa-switch` keeps `disabled` and `checked` as properties without reflecting
 * them to attributes, so Playwright's attribute-based matchers cannot see
 * them; read the properties instead.
 */
function switchState(toggle: Locator): Promise<{ disabled: boolean; checked: boolean }> {
  return toggle.evaluate((element: WaSwitch) => ({ disabled: element.disabled, checked: element.checked }))
}

/** The chosen value of a `wa-select`; a property, like the switch's state. */
function selectValue(select: Locator): Promise<string | string[] | null> {
  return select.evaluate((element: WaSelect) => element.value)
}

/** Click `button` and return the download it triggers. */
async function clickForDownload(page: Page, button: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  return download
}

test('loads the 2D CT head pair, registers it, and downloads the result and transform', async ({ page }) => {
  // Chromium reports this benign layout warning as an error when niivue's
  // canvases and the split panel resize each other during a frame.
  const IGNORED_PAGE_ERRORS = [/ResizeObserver loop completed with undelivered notifications/]
  const pageErrors: string[] = []
  page.on('pageerror', (error) => {
    if (!IGNORED_PAGE_ERRORS.some((pattern) => pattern.test(error.message))) {
      pageErrors.push(error.message)
    }
  })

  const showResult = page.locator('#show-result')

  await test.step('load the sample pair from the splash dialog', async () => {
    await page.goto('/')

    // The wa-dialog host has no box of its own; the native <dialog> in its
    // shadow root is what the user sees.
    const splash = page.locator('#splash dialog')
    await expect(splash).toBeVisible()

    await page.locator('#sample-ct-2d-head').click()
    await expect(splash).toBeHidden({ timeout: LOAD_TIMEOUT })

    await expect.poll(() => volumeCount(page, 'fixed')).toBe(1)
    await expect.poll(() => volumeCount(page, 'moving')).toBe(1)
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
