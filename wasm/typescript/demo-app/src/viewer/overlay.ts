// Overlay mode: the "Overlay on fixed" switch and the opacity slider in the
// view controls row (markup in index.html). While the switch is on, the
// fixed panel draws the moving panel's content (the moving image, or the
// registered result while "Show registered result" is on) over the fixed
// image as a second volume in red, at the slider's opacity, so alignment
// can be judged in one picture; the base keeps its own colormap. Which
// image that is and whether the controls apply are read from the store on
// every update, so the result toggle swaps the overlay and a new pair,
// which resets the switch, drops it. The niivue work is the fixed panel's
// (src/viewer/panel.ts): it is handed the wanted overlay after every update
// and changes nothing while that stays the same. The constants and the
// slider arithmetic are in src/viewer/overlay-options.ts.
import type WaSlider from '@awesome.me/webawesome/dist/components/slider/slider.js'
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js'

import {
  canOverlay,
  overlayContent,
  overlayOpacityChanged,
  overlayToggled,
  type AppState,
  type AppStore,
} from '../state'
import { errorMessage } from '../ui/notify-options'
import { createListenerBag, requireElement, type Shell } from '../ui/shell'
import { OVERLAY_COLORMAP, OVERLAY_OPACITY_STEP, formatOpacity } from './overlay-options'
import type { OverlayContent } from './panel'

export interface OverlayElements {
  /** `#overlay-toggle`, enabled once both inputs are loaded. */
  toggle: WaSwitch
  /** `#overlay-opacity`, enabled while the overlay is on. */
  opacity: WaSlider
}

export interface Overlay {
  readonly elements: OverlayElements
  /** Bring the controls and the fixed panel in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

export type OverlayShell = Pick<Shell, 'fixedPanel' | 'setStatus'>

/**
 * What the fixed panel blends over its base for `state`: the overlay
 * content in the overlay colormap at the chosen opacity, or null while
 * overlay mode is off.
 */
export function overlayVolume(state: Readonly<AppState>): OverlayContent | null {
  const content = overlayContent(state)
  return content ? { ...content, colormap: OVERLAY_COLORMAP, opacity: state.overlayOpacity } : null
}

/**
 * Bind the overlay controls under `root` to `store` and the shell's fixed
 * panel, and keep them and the panel's overlay in sync with the state until
 * `destroy()` is called.
 */
export function createOverlay(root: ParentNode, store: AppStore, shell: OverlayShell): Overlay {
  const elements: OverlayElements = {
    toggle: requireElement(root, '#overlay-toggle'),
    opacity: requireElement(root, '#overlay-opacity'),
  }
  const slider = elements.opacity
  slider.min = 0
  slider.max = 1
  slider.step = OVERLAY_OPACITY_STEP
  // A property, not an attribute, so it cannot live in the markup.
  slider.valueFormatter = formatOpacity

  function render(state: Readonly<AppState>): void {
    const available = canOverlay(state)
    elements.toggle.disabled = !available
    elements.toggle.checked = state.overlay
    slider.disabled = !(available && state.overlay)
    // Setting the value from code fires no `input`, so this cannot loop.
    if (slider.value !== state.overlayOpacity) {
      slider.value = state.overlayOpacity
    }

    const volume = overlayVolume(state)
    shell.fixedPanel.setOverlay(volume).catch((error: unknown) => {
      const reason = errorMessage(error)
      shell.setStatus({
        message: volume
          ? `Could not overlay ${volume.name} on the fixed image: ${reason}`
          : `Could not remove the overlay from the fixed image: ${reason}`,
        variant: 'danger',
      })
      // The panel shows no overlay, so the switch must not claim one.
      if (volume && store.state.overlay) {
        store.update(overlayToggled(false))
      }
    })
  }

  const bag = createListenerBag()
  bag.listen(elements.toggle, 'change', () => {
    store.update(overlayToggled(elements.toggle.checked))
  })
  // `input` fires on every step while the thumb is dragged or arrowed, so
  // the blend follows it live; `change` would wait for the release.
  bag.listen(slider, 'input', () => {
    store.update(overlayOpacityChanged(slider.value))
  })

  const unsubscribe = store.subscribe(render)
  render(store.state)

  return {
    elements,
    render,
    destroy() {
      unsubscribe()
      bag.removeAll()
    },
  }
}
