// Responsive layout and theming: below 800 px the split panel stacks the
// two viewers and each canvas's drawing buffer keeps matching its CSS box
// (no stretched pixels), the theme toggle defaults to the OS scheme, pins
// the other one across a reload, follows the OS again once unpinned, and
// the footer links the projects the demo is built on. Elements are found
// by their stable ids; the scheme is read from the root element's class
// and localStorage, as src/ui/theme.ts writes them.
import { expect, test, type Page } from '@playwright/test'
import type WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'

import type { SlotRole } from '../src/ui/splash-slots'
import { NARROW_LAYOUT_MAX_WIDTH_PX } from '../src/ui/layout-options'
import { DARK_THEME_CLASS, THEME_STORAGE_KEY } from '../src/ui/theme-options'
import { CT_SAMPLE_BUTTON, LOAD_TIMEOUT, collectPageErrors, loadSample } from './helpers'

const WIDE = { width: 1280, height: 720 }
const NARROW = { width: NARROW_LAYOUT_MAX_WIDTH_PX - 100, height: 900 }

function orientation(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector<WaSplitPanel>('#viewers')!.orientation)
}

/** The drawing buffer of the `role` canvas beside the buffer its CSS box calls for. */
function canvasFit(page: Page, role: SlotRole): Promise<{ buffer: number[]; expected: number[] }> {
  return page.evaluate((role) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-role="${role}"]`)!
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    return {
      buffer: [canvas.width, canvas.height],
      expected: [Math.max(1, Math.floor(rect.width * dpr)), Math.max(1, Math.floor(rect.height * dpr))],
    }
  }, role)
}

async function expectCanvasesToFit(page: Page): Promise<void> {
  for (const role of ['fixed', 'moving'] as const) {
    await expect
      .poll(async () => {
        const { buffer, expected } = await canvasFit(page, role)
        return buffer.join('x') === expected.join('x') ? 'fits' : `buffer ${buffer.join('x')} over box ${expected.join('x')}`
      }, { message: `the ${role} canvas should be drawn at the size of its box` })
      .toBe('fits')
  }
}

/** Bounding boxes of the two viewer panels, to tell side by side from stacked. */
function panelBoxes(page: Page): Promise<Record<SlotRole, { left: number; top: number; right: number; bottom: number }>> {
  return page.evaluate(() => {
    const box = (role: string) => {
      const { left, top, right, bottom } = document.querySelector(`[data-panel="${role}"]`)!.getBoundingClientRect()
      return { left, top, right, bottom }
    }
    return { fixed: box('fixed'), moving: box('moving') }
  })
}

function isDark(page: Page): Promise<boolean> {
  return page.evaluate((cls) => document.documentElement.classList.contains(cls), DARK_THEME_CLASS)
}

function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)
}

function metaColorScheme(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content)
}

test('stacks the viewers below 800 px and keeps the canvases drawn at the size of their boxes', async ({ page }) => {
  const pageErrors: string[] = []
  collectPageErrors(page, pageErrors)

  await page.setViewportSize(WIDE)
  await page.goto('./')
  await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
  expect(await orientation(page)).toBe('horizontal')
  await expectCanvasesToFit(page)

  await test.step('narrow the viewport', async () => {
    await page.setViewportSize(NARROW)
    await expect.poll(() => orientation(page)).toBe('vertical')
    await expect.poll(async () => {
      const { fixed, moving } = await panelBoxes(page)
      return fixed.bottom <= moving.top && fixed.right > 0 && moving.right > 0
    }, { message: 'the fixed panel should sit above the moving panel' }).toBe(true)
    await expectCanvasesToFit(page)
  })

  await test.step('widen it again', async () => {
    await page.setViewportSize(WIDE)
    await expect.poll(() => orientation(page)).toBe('horizontal')
    await expect.poll(async () => {
      const { fixed, moving } = await panelBoxes(page)
      return fixed.right <= moving.left
    }, { message: 'the fixed panel should sit beside the moving panel' }).toBe(true)
    await expectCanvasesToFit(page)
  })

  expect(pageErrors).toEqual([])
})

test.describe('with a dark operating system', () => {
  test.use({ colorScheme: 'dark' })

  test('the theme toggle follows the system, pins the other scheme across a reload, and unpins again', async ({ page }) => {
    const pageErrors: string[] = []
    collectPageErrors(page, pageErrors)
    const toggle = page.locator('#theme-toggle')
    const label = page.locator('#theme-toggle-label')

    await page.goto('./')
    // Set by the inline script in index.html before the app module runs.
    expect(await isDark(page)).toBe(true)
    expect(await storedTheme(page)).toBeNull()
    expect(await metaColorScheme(page)).toBe('light dark')
    // The splash dialog is modal; the header is reachable once a pair is loaded.
    await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    await expect(label).toHaveText('Switch to the light theme')

    await test.step('pin the light theme', async () => {
      await toggle.click()
      await expect.poll(() => isDark(page)).toBe(false)
      expect(await storedTheme(page)).toBe('light')
      expect(await metaColorScheme(page)).toBe('light')
      await expect(label).toHaveText('Switch to the dark theme')
    })

    await test.step('the pinned theme survives a reload and a system change', async () => {
      await page.reload()
      expect(await isDark(page)).toBe(false)
      await page.emulateMedia({ colorScheme: 'light' })
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await isDark(page)).toBe(false)
      await loadSample(page, CT_SAMPLE_BUTTON, LOAD_TIMEOUT)
    })

    await test.step('choosing the system scheme unpins it', async () => {
      await toggle.click()
      await expect.poll(() => isDark(page)).toBe(true)
      expect(await storedTheme(page)).toBeNull()
      expect(await metaColorScheme(page)).toBe('light dark')
      await page.reload()
      expect(await isDark(page)).toBe(true)
      // Unpinned, the page follows the system again.
      await page.emulateMedia({ colorScheme: 'light' })
      await expect.poll(() => isDark(page)).toBe(false)
      expect(await storedTheme(page)).toBeNull()
    })

    expect(pageErrors).toEqual([])
  })
})

test('the footer links ITKElastix, elastix, niivue, ngff-zarr, and Web Awesome', async ({ page }) => {
  await page.goto('./')
  const links = page.locator('footer.app-footer nav a')
  await expect(links).toHaveText(['ITKElastix', 'elastix', 'niivue', 'ngff-zarr', 'Web Awesome'])
  const hrefs = await links.evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs).toEqual([
    'https://github.com/InsightSoftwareConsortium/ITKElastix',
    'https://elastix.dev/',
    'https://github.com/niivue/niivue',
    'https://github.com/fideus-labs/ngff-zarr',
    'https://webawesome.com/',
  ])
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('rel', /noopener/)
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /logo\.svg$/)
  await expect(page.locator('header img.app-logo')).toHaveAttribute('src', /logo\.svg$/)
})
