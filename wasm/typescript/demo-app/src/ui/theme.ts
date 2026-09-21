// The light/dark theme toggle in the header (`#theme-toggle`, markup in
// index.html). The scheme is applied by toggling WebAwesome's `wa-dark`
// class on the root element; `<meta name="color-scheme">` is kept in step
// so the browser's own UI (scrollbars, form controls, the canvas behind the
// page) matches; a pinned choice is persisted in localStorage and followed
// in every tab, and the system preference is followed otherwise. The
// inline script in index.html has already applied the same decision before
// the first paint, so this module takes over without a flash. The
// decisions are in src/ui/theme-options.ts.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaTooltip from '@awesome.me/webawesome/dist/components/tooltip/tooltip.js'

import { createListenerBag, requireElement } from './shell'
import {
  DARK_SCHEME_QUERY,
  DARK_THEME_CLASS,
  THEME_STORAGE_KEY,
  isColorScheme,
  metaColorScheme,
  oppositeScheme,
  resolveScheme,
  storedChoice,
  toggleLabel,
  type ColorScheme,
} from './theme-options'

/** The part of `Storage` the toggle uses; null when storage is unavailable. */
export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface ThemeToggleOptions {
  /** Where the pinned choice lives; defaults to `window.localStorage`. */
  storage?: ThemeStorage | null
  /** The system preference; defaults to `matchMedia(DARK_SCHEME_QUERY)`. */
  media?: MediaQueryList
  /** The element carrying the `wa-dark` class; defaults to the root element. */
  target?: HTMLElement
}

export interface ThemeToggleElements {
  /** `#theme-toggle` */
  button: WaButton
  /** `#theme-toggle-label`, the button's visually hidden name. */
  label: HTMLElement
  /** `#theme-toggle-tooltip` */
  tooltip: WaTooltip
}

export interface ThemeToggle {
  readonly elements: ThemeToggleElements
  /** The scheme in effect. */
  readonly scheme: ColorScheme
  /** Whether the user pinned the scheme, rather than the page following the system. */
  readonly pinned: boolean
  /** Show `scheme`; it is pinned unless it is the system's. */
  set(scheme: ColorScheme): void
  /** Switch to the other scheme. */
  toggle(): void
  destroy(): void
}

/** `window.localStorage`, or null where reading it throws (some private modes). */
function defaultStorage(): ThemeStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Bind the theme toggle under `root`, apply the stored or system scheme,
 * and keep the root element, the meta tag, and the button in step until
 * `destroy()` is called.
 */
export function createThemeToggle(root: ParentNode, options: ThemeToggleOptions = {}): ThemeToggle {
  const elements: ThemeToggleElements = {
    button: requireElement(root, '#theme-toggle'),
    label: requireElement(root, '#theme-toggle-label'),
    tooltip: requireElement(root, '#theme-toggle-tooltip'),
  }
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const media = options.media ?? window.matchMedia(DARK_SCHEME_QUERY)
  const target = options.target ?? document.documentElement
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')

  function readStored(): ColorScheme | null {
    try {
      const value = storage?.getItem(THEME_STORAGE_KEY)
      return isColorScheme(value) ? value : null
    } catch {
      return null
    }
  }

  function writeStored(choice: ColorScheme | null): void {
    try {
      if (choice === null) {
        storage?.removeItem(THEME_STORAGE_KEY)
      } else {
        storage?.setItem(THEME_STORAGE_KEY, choice)
      }
    } catch {
      // Without storage the choice lasts for this page only.
    }
  }

  let scheme: ColorScheme = resolveScheme(readStored(), media.matches)

  /** Bring the page in line with what is stored and what the system prefers. */
  function apply(): void {
    const stored = readStored()
    scheme = resolveScheme(stored, media.matches)
    target.classList.toggle(DARK_THEME_CLASS, scheme === 'dark')
    if (meta) {
      meta.content = metaColorScheme(stored)
    }
    const text = toggleLabel(scheme)
    elements.label.textContent = text
    elements.tooltip.textContent = text
  }

  function set(next: ColorScheme): void {
    writeStored(storedChoice(next, media.matches))
    apply()
  }

  const bag = createListenerBag()
  bag.listen(elements.button, 'click', () => set(oppositeScheme(scheme)))
  // A system change is followed unless a scheme is pinned; apply() decides.
  bag.listen(media, 'change', () => apply())
  // Another tab changing the choice changes this one too.
  bag.listen(window, 'storage', (event) => {
    const { key } = event as StorageEvent
    if (key === null || key === THEME_STORAGE_KEY) {
      apply()
    }
  })
  apply()

  return {
    elements,
    get scheme() {
      return scheme
    },
    get pinned() {
      return readStored() !== null
    },
    set,
    toggle() {
      set(oppositeScheme(scheme))
    },
    destroy() {
      bag.removeAll()
    },
  }
}
