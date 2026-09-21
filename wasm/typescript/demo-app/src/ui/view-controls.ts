// The view controls row above the two panels (markup in index.html): the
// slice layout picker for a 3D pair, "Reset view", and a colormap picker
// per panel. The panels keep the choices and re-apply them whenever their
// volume is replaced (src/viewer/panel.ts), so this module only forwards
// them; whether the layout picker applies is rendered from the store, since
// a 2D pair is always shown axially. The decisions are in
// src/ui/view-options.ts.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'

import type { AppState, AppStore } from '../state'
import { PANEL_ROLES, resetLinkedViews, type DemoPanelRole, type ViewerPanel } from '../viewer/panel'
import { createListenerBag, fillPicker, requireElement, type Shell } from './shell'
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
  /** `#fixed-colormap` / `#moving-colormap` */
  colormaps: Readonly<Record<DemoPanelRole, WaSelect>>
}

export interface ViewControls {
  readonly elements: ViewControlsElements
  /** Bring the controls in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

export type ViewControlsShell = Pick<Shell, 'fixedPanel' | 'movingPanel' | 'notify'>

/**
 * Bind the view controls under `root` to `store` and the shell's two
 * panels, and keep them in sync until `destroy()` is called. Both panels
 * start on the default layout so they agree before anything is loaded.
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
  const panels: Readonly<Record<DemoPanelRole, ViewerPanel>> = { fixed: shell.fixedPanel, moving: shell.movingPanel }

  /** Set the layout on both panels so they stay in step whichever has content. */
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
  const colormaps = colormapOptions(shell.fixedPanel.nv.colormaps).map((name) => ({ value: name, label: name }))
  for (const role of PANEL_ROLES) {
    fillPicker(elements.colormaps[role], colormaps)
    elements.colormaps[role].value = panels[role].colormap
  }

  function render(state: Readonly<AppState>): void {
    elements.sliceType.hidden = !showsSliceTypePicker(state)
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
  bag.listen(elements.resetView, 'click', () => {
    // Both panels, centred on the fixed image.
    resetLinkedViews(shell.fixedPanel, shell.movingPanel)
  })
  for (const role of PANEL_ROLES) {
    const picker = elements.colormaps[role]
    bag.listen(picker, 'change', () => {
      const value = picker.value
      if (typeof value !== 'string' || value === '') {
        return
      }
      panels[role].setColormap(value).catch((error: unknown) => {
        // The panel kept its previous colormap; put the picker back on it.
        picker.value = panels[role].colormap
        shell.notify.failure(`Could not apply the ${value} colormap to the ${panels[role].label} panel`, error)
      })
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
