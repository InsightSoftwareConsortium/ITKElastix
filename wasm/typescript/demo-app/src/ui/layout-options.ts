// Decisions behind the responsive layout (src/ui/layout.ts) and the panel
// resize guard (src/viewer/panel.ts), free of the DOM so node:test runs
// them.

/** Below this viewport width the two viewers stack instead of sitting side by side. */
export const NARROW_LAYOUT_MAX_WIDTH_PX = 800

/**
 * The media query matching a narrow viewport, in range syntax. The
 * `@media` rules in style.css use the same breakpoint (layout-options.test.ts
 * checks), so the stacked split panel and the compact rows change together.
 */
export const NARROW_LAYOUT_QUERY = `(width < ${NARROW_LAYOUT_MAX_WIDTH_PX}px)`

/** The `orientation` of a `wa-split-panel`. */
export type SplitOrientation = 'horizontal' | 'vertical'

/** Side by side on a wide viewport, stacked on a narrow one. */
export function orientationFor(narrow: boolean): SplitOrientation {
  return narrow ? 'vertical' : 'horizontal'
}

export interface PixelSize {
  width: number
  height: number
}

/**
 * The drawing buffer niivue gives a canvas whose CSS box is `box` at
 * `devicePixelRatio`: the box scaled to device pixels, rounded down, never
 * empty. Mirrors niivue's own `resize()` so the guard agrees with it.
 */
export function drawingBufferSize(box: PixelSize, devicePixelRatio: number): PixelSize {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  return {
    width: Math.max(1, Math.floor(box.width * dpr)),
    height: Math.max(1, Math.floor(box.height * dpr)),
  }
}

/**
 * Whether a canvas whose drawing buffer is `buffer` would be stretched or
 * squeezed over a CSS box of `box`, in which case niivue must resize it.
 */
export function canvasIsStale(buffer: PixelSize, box: PixelSize, devicePixelRatio: number): boolean {
  const expected = drawingBufferSize(box, devicePixelRatio)
  return buffer.width !== expected.width || buffer.height !== expected.height
}
