// Helpers shared by the Playwright specs in this directory: the bundled
// samples, the timeouts, and readers for what the app publishes on
// `window.__demo` (the store from src/main.ts, the niivue instances from
// src/viewer/panel.ts, the splash from src/ui/splash.ts). Elements are
// found by their stable ids. WebAwesome keeps `disabled`, `checked`, and
// `value` as properties without reflecting them to attributes, so
// Playwright's attribute-based matchers cannot see them; the helpers read
// the documented properties through `locator.evaluate` instead, and never
// rely on shadow DOM structure. Not a spec: Playwright collects only
// `*.spec.ts`.
import { fileURLToPath } from 'node:url'

import { expect, type Download, type Locator, type Page } from '@playwright/test'
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js'

import type { LoadedImage } from '../src/io/load-image'
import type { SlotRole } from '../src/ui/splash-slots'

/** The bundled sample images, downloaded by scripts/fetch-samples.mjs before the dev server starts. */
export const SAMPLES_DIR = fileURLToPath(new URL('../public/samples/', import.meta.url))
export const CT_FIXED = 'CT_2D_head_fixed.mha'
export const CT_MOVING = 'CT_2D_head_moving.mha'
export const MNI_FIXED = 'tpl-MNI152NLin2009aSym_res-1_T2w.nii.gz'
export const MNI_MOVING = 'tpl-MNI305_T1w.nii.gz'

/** Ids of the splash buttons that load the bundled pairs (see src/samples.ts). */
export const CT_SAMPLE_BUTTON = 'sample-ct-2d-head'
export const MNI_SAMPLE_BUTTON = 'sample-mni-3d'

/** The 2D CT slices load in well under a second; the ingest wasm compiles on first use. */
export const LOAD_TIMEOUT = 60_000
/** The 3D pair is 16 MB of NIfTI to decompress, pyramid, and display. */
export const LOAD_TIMEOUT_3D = 120_000
/** Registering the 2D CT pair takes about a second locally; CI can be far slower. */
export const REGISTRATION_TIMEOUT = 150_000

/**
 * Page errors that are not the app's: Chromium reports this benign layout
 * warning as an error when niivue's canvases and the split panel resize
 * each other during a frame.
 */
export const IGNORED_PAGE_ERRORS: readonly RegExp[] = [/ResizeObserver loop completed with undelivered notifications/]

/** Push the message of every uncaught page error, except the ignored ones, onto `errors`. */
export function collectPageErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => {
    if (!IGNORED_PAGE_ERRORS.some((pattern) => pattern.test(error.message))) {
      errors.push(error.message)
    }
  })
}

/** Number of volumes the niivue instance of the `role` panel shows. */
export function volumeCount(page: Page, role: SlotRole): Promise<number | undefined> {
  return page.evaluate((role) => window.__demo?.[role]?.volumes.length, role)
}

/** Name of the first volume the niivue instance of the `role` panel shows. */
export function volumeName(page: Page, role: SlotRole): Promise<string | undefined> {
  return page.evaluate((role) => window.__demo?.[role]?.volumes[0]?.name, role)
}

/** The serializable part of a {@link LoadedImage} the specs assert on. */
export interface ImageFacts {
  name: string
  kind: LoadedImage['kind']
  format: LoadedImage['format']
  dimension: LoadedImage['dimension']
  /** Extents of the image elastix receives, x first. */
  size: number[]
  scaleIndex: number
  /** Number of pyramid levels held in memory. */
  levels: number
  registrationBytes: number
  budgetBytes: number
}

/** Where a loaded image lives: committed to the app store, or pending in a splash slot. */
export type ImageHolder = 'store' | 'splash'

/**
 * Facts about the image `role` holds in the store or the splash, or
 * undefined while that slot is empty. `LoadedImage` carries typed arrays
 * and zarr handles, so only plain fields cross the page boundary.
 */
export function imageFacts(page: Page, holder: ImageHolder, role: SlotRole): Promise<ImageFacts | undefined> {
  return page.evaluate(
    ([holder, role]) => {
      const demo = window.__demo
      const image = holder === 'store' ? demo?.state?.state[role] : demo?.splash?.images[role]
      if (!image) {
        return undefined
      }
      return {
        name: image.name,
        kind: image.kind,
        format: image.format,
        dimension: image.dimension,
        size: [...image.itkImage.size],
        scaleIndex: image.scaleIndex,
        levels: image.multiscales.images.length,
        registrationBytes: image.registrationBytes,
        budgetBytes: image.budgetBytes,
      }
    },
    [holder, role] as const,
  )
}

/**
 * `wa-button` keeps `disabled` as a property without reflecting it, so
 * Playwright's `toBeEnabled` cannot see it; read the property instead.
 */
export function isDisabled(button: Locator): Promise<boolean> {
  return button.evaluate((element: WaButton) => element.disabled)
}

/** The `disabled` and `checked` properties of a `wa-switch`, neither of which is reflected. */
export function switchState(toggle: Locator): Promise<{ disabled: boolean; checked: boolean }> {
  return toggle.evaluate((element: WaSwitch) => ({ disabled: element.disabled, checked: element.checked }))
}

/** The chosen value of a `wa-select`; a property, like the switch's state. */
export function selectValue(select: Locator): Promise<string | string[] | null> {
  return select.evaluate((element: WaSelect) => element.value)
}

/**
 * The native dialog inside the `wa-dialog` host: the host itself has no
 * box, so Playwright reports it hidden even while the dialog is open.
 */
export function splashDialog(page: Page): Locator {
  return page.locator('#splash dialog')
}

/**
 * Wait until the splash slot `role` holds `name` and the dialog is idle
 * again: a slot is filled before the busy flag drops, and "Start" and the
 * pair check only follow once it has.
 */
export async function waitForSlot(page: Page, role: SlotRole, name: string, timeout = LOAD_TIMEOUT): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((role) => {
          const splash = window.__demo?.splash
          return { name: splash?.images[role]?.name, loading: splash?.loading }
        }, role),
      { message: `the ${role} slot should finish loading ${name}`, timeout },
    )
    .toEqual({ name, loading: false })
}

/** Click a sample button and wait for the pair to reach the store and both viewers. */
export async function loadSample(page: Page, sampleId: string, timeout: number): Promise<void> {
  await expect(splashDialog(page)).toBeVisible()
  await page.locator(`#${sampleId}`).click()
  await expect(splashDialog(page)).toBeHidden({ timeout })
  await expect.poll(() => volumeCount(page, 'fixed'), { timeout }).toBe(1)
  await expect.poll(() => volumeCount(page, 'moving'), { timeout }).toBe(1)
}

/** Press "Start" and wait for the dialog to hand the pair to the app. */
export async function start(page: Page): Promise<void> {
  const startButton = page.locator('#start-registration-inputs')
  await expect.poll(() => isDisabled(startButton), { message: 'a compatible pair should enable Start' }).toBe(false)
  await startButton.click()
  await expect(splashDialog(page)).toBeHidden({ timeout: LOAD_TIMEOUT })
}

/** Click `button` and return the download it triggers. */
export async function clickForDownload(page: Page, button: Locator): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  return download
}
