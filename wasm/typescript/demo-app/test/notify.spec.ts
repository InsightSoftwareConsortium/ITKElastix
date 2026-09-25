// Notifications (src/ui/notify.ts): outcomes reach the user as toasts in
// the stack at the top right, a success after registration that dismisses
// itself and a danger after a failed download that its button dismisses
// with the download usable again, while the status line keeps the same
// text in the variant's colour; a toast raised while the modal splash
// dialog is open shows above it and still dismisses itself, and the oldest
// toast gives way beyond the limit; and a browser without WebGL2 gets a
// persistent message instead of the splash. Elements are found by their
// stable ids and classes; the notifier the app publishes on `window.__demo`
// raises toasts directly where no flow would.
import { expect, test, type Page } from '@playwright/test'

import {
  MAX_TOASTS,
  TOAST_DURATIONS_MS,
  WEBGL2_UNAVAILABLE_MESSAGE,
  WEBGL2_UNAVAILABLE_STATUS,
} from '../src/ui/notify-options'
import {
  LOAD_TIMEOUT,
  REGISTRATION_TIMEOUT,
  TAILBUD_2D_SAMPLE_BUTTON,
  collectPageErrors,
  holdRegistration,
  isDisabled,
  loadSample,
  selectValue,
  splashDialog,
  statusText,
  toastFacts,
  toasts,
} from './helpers'

/** Raise a toast through the notifier the app publishes, as a module outside a flow would. */
function raise(page: Page, variant: 'success' | 'warning' | 'danger', message: string, duration?: number): Promise<void> {
  return page.evaluate(
    ([variant, message, duration]) => {
      window.__demo!.notify![variant](message, duration === undefined ? {} : { duration })
    },
    [variant, message, duration] as const,
  )
}

test('reports registration and download outcomes as toasts that dismiss themselves or on click', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  const releaseRegistration = await holdRegistration(page)
  await page.goto('./')
  await loadSample(page, TAILBUD_2D_SAMPLE_BUTTON, LOAD_TIMEOUT)
  expect(await toastFacts(page)).toEqual([])

  await test.step('the registration the load started raises a success toast and colours the status line', async () => {
    await releaseRegistration()
    await expect(toasts(page, 'success')).toHaveCount(1, { timeout: REGISTRATION_TIMEOUT })
    const [toast] = await toastFacts(page)
    // The status row is a live region, so the shell raises its toasts unannounced.
    expect(toast).toMatchObject({ variant: 'success', persistent: false, dismissible: true, role: null })
    expect(toast!.message).toMatch(/^Registered in \d+\.\d s/)
    expect(await statusText(page)).toBe(toast!.message)
    await expect(page.locator('#status')).toHaveAttribute('data-variant', 'success')
  })

  await test.step('the toast goes on its own once its time is up; the status line keeps the text', async () => {
    await expect(toasts(page)).toHaveCount(0, { timeout: TOAST_DURATIONS_MS.success + 5_000 })
    expect(await statusText(page)).toMatch(/^Registered in/)
  })

  await test.step('a failed download raises a danger toast; its button dismisses it and the download is usable again', async () => {
    // ITK's JPEG writer takes 8-bit pixels only, so it rejects the uint16
    // tailbud result (see src/io/export-plan.ts).
    await page.locator('#image-format').click()
    await page.locator('#image-format wa-option[value="jpg"]').click()
    await expect.poll(() => selectValue(page.locator('#image-format'))).toBe('jpg')
    await page.locator('#download-image').click()
    await expect(toasts(page, 'danger')).toHaveCount(1, { timeout: LOAD_TIMEOUT })
    const [toast] = await toastFacts(page)
    expect(toast).toMatchObject({ variant: 'danger', persistent: false, dismissible: true, role: null })
    expect(toast!.message).toMatch(/^Could not write registered\.jpg: /)
    expect(await statusText(page)).toBe(toast!.message)
    await expect(page.locator('#status')).toHaveAttribute('data-variant', 'danger')
    await expect.poll(() => isDisabled(page.locator('#download-image'))).toBe(false)

    await toasts(page, 'danger').locator('.toast-dismiss').click()
    await expect(toasts(page)).toHaveCount(0)
  })

  expect(pageErrors).toEqual([])
})

test('a toast shows above the splash dialog, and the oldest toast gives way beyond the limit', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  await page.goto('./')
  await expect(splashDialog(page)).toBeVisible()

  await test.step('a toast raised while the modal dialog is open is on show and goes on its own', async () => {
    // The stack is a popover shown after the dialog, so it paints above
    // it; the modal dialog keeps everything else inert, though, so the
    // toast cannot be clicked until the dialog closes, and only its own
    // clock can take it away meanwhile.
    await raise(page, 'warning', 'Raised while the dialog is open', 1_500)
    const toast = toasts(page, 'warning')
    await expect(toast).toBeVisible()
    expect((await toastFacts(page))[0]).toMatchObject({
      message: 'Raised while the dialog is open',
      variant: 'warning',
      persistent: false,
      dismissible: true,
      role: 'status',
    })
    const box = (await toast.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.x + box.width, 'the stack sits at the top right').toBeGreaterThan(viewport.width * 0.75)
    await expect(toasts(page)).toHaveCount(0, { timeout: 5_000 })
    await expect(splashDialog(page)).toBeVisible()
  })

  await test.step('beyond the limit the oldest toast gives way, and a click dismisses one', async () => {
    // Parked, the registration the load starts raises no toast of its own.
    await holdRegistration(page)
    await loadSample(page, TAILBUD_2D_SAMPLE_BUTTON, LOAD_TIMEOUT)
    for (let index = 1; index <= MAX_TOASTS + 1; index += 1) {
      await raise(page, 'success', `Toast ${index}`)
    }
    await expect(toasts(page)).toHaveCount(MAX_TOASTS)
    expect((await toastFacts(page)).map((toast) => toast.message)).toEqual(
      Array.from({ length: MAX_TOASTS }, (_, index) => `Toast ${index + 2}`),
    )
    await toasts(page).last().locator('.toast-dismiss').click()
    await expect(toasts(page)).toHaveCount(MAX_TOASTS - 1)
    expect((await toastFacts(page)).map((toast) => toast.message)).not.toContain(`Toast ${MAX_TOASTS + 1}`)
  })

  expect(pageErrors).toEqual([])
})

test('a browser without WebGL2 gets a persistent danger message instead of the splash', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)
  // Refuse WebGL2 contexts only; the 2D contexts the page may use still work.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext as (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) => RenderingContext | null
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
      return type === 'webgl2' ? null : getContext.call(this, type, options)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('./')

  await expect(toasts(page, 'danger')).toHaveCount(1)
  expect(await toastFacts(page)).toEqual([
    { message: WEBGL2_UNAVAILABLE_MESSAGE, variant: 'danger', persistent: true, dismissible: false, role: 'alert' },
  ])
  expect(await statusText(page)).toBe(WEBGL2_UNAVAILABLE_STATUS)
  await expect(page.locator('#status')).toHaveAttribute('data-variant', 'danger')
  await expect(splashDialog(page)).toBeHidden()
  expect(await isDisabled(page.locator('#load-images'))).toBe(true)
  // Persistent: it is still there after every other toast would have gone.
  await page.waitForTimeout(1_000)
  await expect(toasts(page, 'danger')).toHaveCount(1)
  expect(pageErrors).toEqual([])
})
