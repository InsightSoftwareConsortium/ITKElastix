// Decisions behind the light/dark theme toggle (src/ui/theme.ts), free of
// the DOM so node:test runs them. WebAwesome keys its dark palette on the
// `wa-dark` class of the root element and is light otherwise, so "which
// scheme" is the whole decision. The toggle is a two-state control: the
// page follows the operating system until the user picks the other scheme,
// which pins it; picking the system's scheme again unpins it, so later
// system changes are followed. The inline script in index.html applies the
// same rule before the first paint, so the two must agree on the storage
// key, the class name, and the media query (theme-options.test.ts checks).

export type ColorScheme = 'light' | 'dark'

/** `localStorage` key of the pinned scheme; absent while the page follows the system. */
export const THEME_STORAGE_KEY = 'elastix-demo-theme'

/** The root-element class WebAwesome's dark palette is keyed on. */
export const DARK_THEME_CLASS = 'wa-dark'

/** The media query the system preference is read from. */
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

export function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark'
}

/** The scheme the system prefers. */
export function systemScheme(prefersDark: boolean): ColorScheme {
  return prefersDark ? 'dark' : 'light'
}

/** The scheme to show: the pinned one when it is valid, else the system's. */
export function resolveScheme(stored: unknown, prefersDark: boolean): ColorScheme {
  return isColorScheme(stored) ? stored : systemScheme(prefersDark)
}

export function oppositeScheme(scheme: ColorScheme): ColorScheme {
  return scheme === 'dark' ? 'light' : 'dark'
}

/**
 * What to keep in storage once the user chooses `scheme`: the scheme when
 * it differs from the system's (pinned), null when it matches (the page
 * follows the system again).
 */
export function storedChoice(scheme: ColorScheme, prefersDark: boolean): ColorScheme | null {
  return scheme === systemScheme(prefersDark) ? null : scheme
}

/**
 * The `content` of `<meta name="color-scheme">`, which themes the browser's
 * own UI (scrollbars, form controls): the pinned scheme, or both while the
 * page follows the system.
 */
export function metaColorScheme(stored: ColorScheme | null): string {
  return stored ?? 'light dark'
}

/** The toggle's accessible name and tooltip: the action it performs from `scheme`. */
export function toggleLabel(scheme: ColorScheme): string {
  return `Switch to the ${oppositeScheme(scheme)} theme`
}
