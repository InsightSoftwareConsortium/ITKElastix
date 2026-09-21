// The responsive layout: the split panel holding the two viewers sits
// side by side on a wide viewport and stacks on a narrow one, following a
// `matchMedia` listener on the breakpoint in src/ui/layout-options.ts. The
// `@media` rules in style.css compact the header and control rows at the
// same width. Each panel keeps its own canvas sized to its box
// (src/viewer/panel.ts), so the flip needs no help from here.
import type WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'

import { NARROW_LAYOUT_QUERY, orientationFor } from './layout-options'
import { createListenerBag, requireElement } from './shell'

export interface LayoutOptions {
  /** The narrow-viewport query; defaults to `matchMedia(NARROW_LAYOUT_QUERY)`. */
  media?: MediaQueryList
}

export interface Layout {
  /** `#viewers`, the split panel. */
  readonly viewers: WaSplitPanel
  /** Whether the viewers are stacked. */
  readonly narrow: boolean
  destroy(): void
}

/** Bind the split panel under `root` to the viewport width until `destroy()` is called. */
export function createLayout(root: ParentNode, options: LayoutOptions = {}): Layout {
  const viewers = requireElement<WaSplitPanel>(root, '#viewers')
  const media = options.media ?? window.matchMedia(NARROW_LAYOUT_QUERY)

  function apply(narrow: boolean): void {
    const orientation = orientationFor(narrow)
    if (viewers.orientation !== orientation) {
      viewers.orientation = orientation
    }
  }

  const bag = createListenerBag()
  bag.listen(media, 'change', (event) => apply((event as MediaQueryListEvent).matches))
  apply(media.matches)

  return {
    viewers,
    get narrow() {
      return media.matches
    },
    destroy() {
      bag.removeAll()
    },
  }
}
