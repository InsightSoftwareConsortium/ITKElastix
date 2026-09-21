// "Image details" under each viewer panel: a collapsible wa-details whose
// summary row names what the panel displays in one line and whose body
// lists the same rows as the splash summaries plus the source format and
// the pixel budget (src/ui/image-summary.ts). Rendered from the state
// store, so the moving panel's details switch to the registered result
// while the result toggle is on. The two details open and close together
// so the canvases above them keep matching heights. Markup in index.html.
import type WaDetails from '@awesome.me/webawesome/dist/components/details/details.js'

import type { AppState, AppStore } from '../state'
import { PANEL_ROLES, type DemoPanelRole } from '../viewer/panel'
import { panelDetails } from './image-summary'
import { requireElement } from './shell'
import { renderSummaryList } from './summary-list'

/** The controls of one panel's details; ids follow the `fixed-details*` / `moving-details*` pattern. */
export interface ImageInfoElements {
  details: WaDetails
  /** The one-line brief in the summary row, next to the "Image details" title. */
  brief: HTMLElement
  /** The `<dl>` the rows are rendered into. */
  list: HTMLElement
}

export interface ImageInfo {
  readonly elements: Readonly<Record<DemoPanelRole, ImageInfoElements>>
  /** Bring both details in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

function infoElements(root: ParentNode, role: DemoPanelRole): ImageInfoElements {
  return {
    details: requireElement(root, `#${role}-details`),
    brief: requireElement(root, `#${role}-details-brief`),
    list: requireElement(root, `#${role}-details-list`),
  }
}

/**
 * Keep `to` open whenever `from` is opened and closed whenever it is
 * closed. Setting `open` on `to` fires its own event, which finds the
 * states already equal and stops there. Returns the remover.
 */
function mirrorOpenState(from: WaDetails, to: WaDetails): () => void {
  const handler = (event: Event) => {
    if (event.target === from && to.open !== from.open) {
      to.open = from.open
    }
  }
  from.addEventListener('wa-show', handler)
  from.addEventListener('wa-hide', handler)
  return () => {
    from.removeEventListener('wa-show', handler)
    from.removeEventListener('wa-hide', handler)
  }
}

/**
 * Bind the two "Image details" under `root` to `store` and keep them in
 * sync with the state until `destroy()` is called. An empty panel's
 * details are hidden; `data-content` on the details element names what
 * they describe (`fixed`, `moving`, or `result`) for tests.
 */
export function createImageInfo(root: ParentNode, store: AppStore): ImageInfo {
  const elements: Record<DemoPanelRole, ImageInfoElements> = {
    fixed: infoElements(root, 'fixed'),
    moving: infoElements(root, 'moving'),
  }

  function render(state: Readonly<AppState>): void {
    for (const role of PANEL_ROLES) {
      const { details, brief, list } = elements[role]
      const info = panelDetails(state, role)
      details.hidden = info === undefined
      if (info === undefined) {
        delete details.dataset.content
      } else {
        details.dataset.content = info.content
      }
      brief.textContent = info?.brief ?? ''
      renderSummaryList(list, info?.fields ?? [])
    }
  }

  const unmirror = [
    mirrorOpenState(elements.fixed.details, elements.moving.details),
    mirrorOpenState(elements.moving.details, elements.fixed.details),
  ]
  const unsubscribe = store.subscribe(render)
  render(store.state)

  return {
    elements,
    render,
    destroy() {
      unsubscribe()
      for (const remove of unmirror) {
        remove()
      }
    },
  }
}
