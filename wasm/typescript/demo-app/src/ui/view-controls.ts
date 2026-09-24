// The view controls row above the comparisons (markup in index.html): the
// slice layout picker for a 3D pair, "Reset view", and a colormap picker
// per comparison side (one for the fixed image, shown on both comparisons,
// one for the moving image and the registered result). The panels keep the
// choices and re-apply them whenever their volume is replaced
// (src/viewer/panel.ts), so this module only forwards them; whether the
// layout picker applies is rendered from the store, since a 2D pair is
// always shown axially. "Reset view" also centres the two comparison
// dividers. The decisions are in src/ui/view-options.ts and
// src/viewer/comparison-options.ts.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'

import type { AppState, AppStore } from '../state'
import {
  COMPARISON_ROLES,
  COMPARISON_SIDES,
  DEFAULT_COMPARISON_POSITION,
  PANEL_ROLES,
  panelsOnSide,
  type ComparisonSide,
} from '../viewer/comparison-options'
import { resetLinkedViews } from '../viewer/panel'
import { createListenerBag, fillPicker, requireElement, type Shell, type ShellElements } from './shell'
import {
  DEFAULT_SLICE_TYPE_ID,
  SLICE_TYPE_OPTIONS,
  colormapOptions,
  isSliceTypeId,
  showsSliceTypePicker,
  sliceTypeForId,
} from './view-options'

export interface ViewControlsElements {
  /** `#slice-type`, hidden while the loaded pair is 2D. */
  sliceType: WaSelect
  /** `#reset-view` */
  resetView: WaButton
  /** `#fixed-colormap` / `#moving-colormap`, each applied to that side of both comparisons. */
  colormaps: Readonly<Record<ComparisonSide, WaSelect>>
}

export interface ViewControls {
  readonly elements: ViewControlsElements
  /** Bring the controls in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

export type ViewControlsShell = Pick<Shell, 'panels' | 'notify'> & {
  readonly elements: Pick<ShellElements, 'comparisons'>
}

/**
 * Bind the view controls under `root` to `store` and the shell's panels and
 * comparisons, and keep them in sync until `destroy()` is called. Every
 * panel starts on the default layout so they agree before anything is
 * loaded.
 */
export function createViewControls(root: ParentNode, store: AppStore, shell: ViewControlsShell): ViewControls {
  const elements: ViewControlsElements = {
    sliceType: requireElement(root, '#slice-type'),
    resetView: requireElement(root, '#reset-view'),
    colormaps: {
      fixed: requireElement(root, '#fixed-colormap'),
      moving: requireElement(root, '#moving-colormap'),
    },
  }
  const { panels } = shell

  /** Set the layout on every panel so they stay in step whichever has content. */
  function applySliceType(sliceType: number): void {
    for (const role of PANEL_ROLES) {
      panels[role].setSliceType(sliceType)
    }
  }

  fillPicker(
    elements.sliceType,
    SLICE_TYPE_OPTIONS.map(({ id, label }) => ({ value: id, label })),
  )
  elements.sliceType.value = DEFAULT_SLICE_TYPE_ID
  applySliceType(sliceTypeForId(DEFAULT_SLICE_TYPE_ID))

  // Every NiiVue instance registers the same built-in colormaps.
  const colormaps = colormapOptions(panels['inputs-fixed'].nv.colormaps).map((name) => ({ value: name, label: name }))
  for (const side of COMPARISON_SIDES) {
    fillPicker(elements.colormaps[side], colormaps)
    // Both panels of a side always share a colormap; the first speaks for both.
    elements.colormaps[side].value = panels[panelsOnSide(side)[0]!].colormap
  }

  function render(state: Readonly<AppState>): void {
    elements.sliceType.hidden = !showsSliceTypePicker(state)
  }

  /** Every panel back to the default view, centred on the fixed image, and both dividers to the middle. */
  function resetViews(): void {
    const [leader, ...followers] = PANEL_ROLES.map((role) => panels[role])
    resetLinkedViews(leader!, followers)
    for (const comparison of COMPARISON_ROLES) {
      shell.elements.comparisons[comparison].position = DEFAULT_COMPARISON_POSITION
    }
  }

  const bag = createListenerBag()
  // `wa-select` fires `change` on the host, with the chosen option's value,
  // for user selection only; setting `value` from code never loops back here.
  bag.listen(elements.sliceType, 'change', () => {
    const value = elements.sliceType.value
    if (isSliceTypeId(value)) {
      applySliceType(sliceTypeForId(value))
    }
  })
  bag.listen(elements.resetView, 'click', resetViews)
  for (const side of COMPARISON_SIDES) {
    const picker = elements.colormaps[side]
    bag.listen(picker, 'change', () => {
      const value = picker.value
      if (typeof value !== 'string' || value === '') {
        return
      }
      for (const role of panelsOnSide(side)) {
        const panel = panels[role]
        panel.setColormap(value).catch((error: unknown) => {
          // The panel kept its previous colormap; put the picker back on it.
          picker.value = panel.colormap
          shell.notify.failure(`Could not apply the ${value} colormap to the ${panel.label} panel`, error)
        })
      }
    })
  }

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
