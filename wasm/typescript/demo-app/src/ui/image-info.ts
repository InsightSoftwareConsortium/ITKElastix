// "Image details" under each comparison: a collapsible wa-details whose
// summary row names both sides in one line and whose body lists, side by
// side, the same rows as the splash summaries for each image plus the
// source format and the pixel budget (src/ui/image-summary.ts). Rendered
// from the state store, so the result comparison's moving side switches
// to the registered result while the result switch is on. The two details
// open and close together so the canvases above them keep matching
// heights. Markup in index.html.
import type WaDetails from '@awesome.me/webawesome/dist/components/details/details.js'

import type { AppState, AppStore } from '../state'
import {
  COMPARISON_ROLES,
  COMPARISON_SIDES,
  panelRole,
  type ComparisonRole,
  type ComparisonSide,
} from '../viewer/comparison-options'
import { comparisonDetails, contentTitle } from './image-summary'
import { requireElement } from './shell'
import { renderSummaryList } from './summary-list'

/** The controls of one side's rows; ids follow the `inputs-fixed-details*` pattern. */
export interface SideInfoElements {
  /** The section holding the side's heading and rows; `data-content` names what it describes. */
  section: HTMLElement
  /** The heading over the rows: "Fixed", "Moving", or "Registered". */
  title: HTMLElement
  /** The `<dl>` the rows are rendered into. */
  list: HTMLElement
}

/** The controls of one comparison's details; ids follow the `inputs-details*` pattern. */
export interface ImageInfoElements {
  details: WaDetails
  /** The one-line brief in the summary row, next to the "Image details" title. */
  brief: HTMLElement
  sides: Readonly<Record<ComparisonSide, SideInfoElements>>
}

export interface ImageInfo {
  readonly elements: Readonly<Record<ComparisonRole, ImageInfoElements>>
  /** Bring both details in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

function sideElements(root: ParentNode, comparison: ComparisonRole, side: ComparisonSide): SideInfoElements {
  const role = panelRole(comparison, side)
  return {
    section: requireElement(root, `#${role}-details`),
    title: requireElement(root, `#${role}-details-title`),
    list: requireElement(root, `#${role}-details-list`),
  }
}

function infoElements(root: ParentNode, comparison: ComparisonRole): ImageInfoElements {
  return {
    details: requireElement(root, `#${comparison}-details`),
    brief: requireElement(root, `#${comparison}-details-brief`),
    sides: {
      fixed: sideElements(root, comparison, 'fixed'),
      moving: sideElements(root, comparison, 'moving'),
    },
  }
}

/**
 * Keep every other details open whenever `from` is opened and closed
 * whenever it is closed. Setting `open` on another fires its own event,
 * which finds the states already equal and stops there. Returns the
 * remover.
 */
function mirrorOpenState(from: WaDetails, others: readonly WaDetails[]): () => void {
  const handler = (event: Event) => {
    if (event.target !== from) {
      return
    }
    for (const other of others) {
      if (other.open !== from.open) {
        other.open = from.open
      }
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
 * sync with the state until `destroy()` is called. An empty comparison's
 * details are hidden; `data-content` on each side's section names what it
 * describes (`fixed`, `moving`, or `result`) for tests.
 */
export function createImageInfo(root: ParentNode, store: AppStore): ImageInfo {
  const elements: Record<ComparisonRole, ImageInfoElements> = {
    inputs: infoElements(root, 'inputs'),
    result: infoElements(root, 'result'),
  }

  function render(state: Readonly<AppState>): void {
    for (const comparison of COMPARISON_ROLES) {
      const { details, brief, sides } = elements[comparison]
      const info = comparisonDetails(state, comparison)
      details.hidden = info === undefined
      brief.textContent = info?.brief ?? ''
      for (const side of COMPARISON_SIDES) {
        const { section, title, list } = sides[side]
        const sideInfo = info?.sides[side]
        if (sideInfo === undefined) {
          delete section.dataset.content
        } else {
          section.dataset.content = sideInfo.content
        }
        title.textContent = sideInfo ? contentTitle(sideInfo.content) : ''
        renderSummaryList(list, sideInfo?.fields ?? [])
      }
    }
  }

  const all = COMPARISON_ROLES.map((comparison) => elements[comparison].details)
  const unmirror = all.map((details) =>
    mirrorOpenState(
      details,
      all.filter((other) => other !== details),
    ),
  )
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
