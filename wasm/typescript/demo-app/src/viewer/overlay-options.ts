// The decisions behind overlay mode (src/viewer/overlay.ts): the colormap
// the overlay is drawn in, the opacity slider's default and granularity, and
// how a slider value becomes an opacity. Pure functions free of DOM access,
// so the node unit tests can cover them; src/state.ts takes its defaults
// from here, so this module must not import the store.

/** niivue colormap the overlay is drawn in; the base volume keeps its own. */
export const OVERLAY_COLORMAP = 'Red'

/** Opacity a fresh overlay is blended at. */
export const DEFAULT_OVERLAY_OPACITY = 0.5

/** Granularity of the opacity slider. */
export const OVERLAY_OPACITY_STEP = 0.05

/**
 * The opacity a slider value stands for: clamped to 0..1, with anything
 * that is not a finite number (an unset `wa-slider` reports null) falling
 * back to the default.
 */
export function clampOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_OVERLAY_OPACITY
  }
  return Math.min(1, Math.max(0, value))
}

/** The slider's tooltip text for an opacity: a whole percentage. */
export function formatOpacity(opacity: number): string {
  return `${Math.round(clampOpacity(opacity) * 100)}%`
}
