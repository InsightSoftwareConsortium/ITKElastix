// The registration panel (markup in index.html): the "Registration
// options" details with the resolutions picker, the pixel budget picker,
// and the Cancel button, and the summary card a finished registration
// fills with the stages, the elapsed time, the fixed-to-moving matrix and
// offset, and a copy button for the elastix transform parameter JSON.
// Everything is rendered from the store: the pickers show the state's
// values and are disabled while a run or reload is active, Cancel is
// enabled while a run is active, and the card follows the result, so a
// re-run replaces its contents and a new pair hides it. The actions behind
// the controls are injected: Cancel aborts the register flow, and a budget
// choice starts the reload flow. The decisions are in
// src/ui/registration-options.ts and src/ui/registration-summary.ts.
//
// Cancel sits in the header toolbar beside Register rather than inside
// the collapsible details, so it can be reached while a long run is under
// way without opening anything.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCard from '@awesome.me/webawesome/dist/components/card/card.js'
import type WaCopyButton from '@awesome.me/webawesome/dist/components/copy-button/copy-button.js'
import type WaDetails from '@awesome.me/webawesome/dist/components/details/details.js'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'

import {
  canCancelRegistration,
  canReloadInputs,
  hasInputs,
  hasResult,
  resolutionsChosen,
  type AppState,
  type AppStore,
} from '../state'
import { RESOLUTION_OPTIONS, budgetBytesForValue, budgetEntries } from './registration-options'
import {
  formatMatrixValue,
  summarizeRegistration,
  summaryBrief,
  summaryFields,
  type RegistrationSummary,
} from './registration-summary'
import { createListenerBag, fillPicker, requireElement } from './shell'
import { renderSummaryList } from './summary-list'

export interface RegistrationPanelElements {
  /** `#registration-options`, the collapsible details. */
  options: WaDetails
  /** `#resolutions`, the pyramid levels per stage. */
  resolutions: WaSelect
  /** `#pixel-budget`, the budget the inputs are loaded under. */
  budget: WaSelect
  /** `#cancel-registration`, enabled while a run is active. */
  cancel: WaButton
  /** `#registration-summary`, hidden until a result exists. */
  summary: WaCard
  /** `#registration-summary-brief`, the one-line brief in the card header. */
  summaryBrief: HTMLElement
  /** `#registration-summary-list`, the `<dl>` the summary rows are rendered into. */
  summaryList: HTMLElement
  /** `#registration-matrix`, the table holding the matrix and offset. */
  matrix: HTMLTableElement
  /** `#copy-transform-parameters`, copies the elastix parameter JSON. */
  copyParameters: WaCopyButton
}

/** Callbacks for the panel's actions; missing ones leave the control inert. */
export interface RegistrationPanelHandlers {
  /** The Cancel button. */
  onCancel?: () => void
  /** A budget picked in the picker, in bytes; the reload flow in the app. */
  onBudgetChosen?: (budgetBytes: number) => void
}

export interface RegistrationPanel {
  readonly elements: RegistrationPanelElements
  /** Bring the controls and the card in line with `state`; runs on every store update. */
  render(state: Readonly<AppState>): void
  destroy(): void
}

/**
 * Fill `table` with the affine: a header row naming the axes and the
 * offset, then one row per output axis holding that row of the matrix and
 * its offset entry. `data-row` and `data-column` on the cells give tests a
 * stable handle.
 */
export function renderMatrixTable(table: HTMLTableElement, summary: RegistrationSummary): void {
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.append(document.createElement('th'))
  for (const dim of summary.dims) {
    const cell = document.createElement('th')
    cell.scope = 'col'
    cell.textContent = dim
    headRow.append(cell)
  }
  const offsetHead = document.createElement('th')
  offsetHead.scope = 'col'
  offsetHead.className = 'registration-matrix-offset'
  offsetHead.textContent = 'offset'
  headRow.append(offsetHead)
  head.append(headRow)

  const body = document.createElement('tbody')
  summary.matrix.forEach((row, i) => {
    const tr = document.createElement('tr')
    tr.dataset.row = summary.dims[i] ?? String(i)
    const label = document.createElement('th')
    label.scope = 'row'
    label.textContent = summary.dims[i] ?? ''
    tr.append(label)
    row.forEach((value, j) => {
      const cell = document.createElement('td')
      cell.dataset.column = summary.dims[j] ?? String(j)
      cell.textContent = formatMatrixValue(value)
      tr.append(cell)
    })
    const offset = document.createElement('td')
    offset.dataset.column = 'offset'
    offset.className = 'registration-matrix-offset'
    offset.textContent = formatMatrixValue(summary.offset[i] ?? Number.NaN)
    tr.append(offset)
    body.append(tr)
  })
  table.replaceChildren(head, body)
}

/**
 * Bind the registration panel under `root` to `store` and keep it in sync
 * with the state until `destroy()` is called.
 */
export function createRegistrationPanel(
  root: ParentNode,
  store: AppStore,
  handlers: RegistrationPanelHandlers = {},
): RegistrationPanel {
  const elements: RegistrationPanelElements = {
    options: requireElement(root, '#registration-options'),
    resolutions: requireElement(root, '#resolutions'),
    budget: requireElement(root, '#pixel-budget'),
    cancel: requireElement(root, '#cancel-registration'),
    summary: requireElement(root, '#registration-summary'),
    summaryBrief: requireElement(root, '#registration-summary-brief'),
    summaryList: requireElement(root, '#registration-summary-list'),
    matrix: requireElement(root, '#registration-matrix'),
    copyParameters: requireElement(root, '#copy-transform-parameters'),
  }

  fillPicker(
    elements.resolutions,
    RESOLUTION_OPTIONS.map((count) => ({ value: String(count), label: String(count) })),
  )

  /** The budget the picker's options were last built for. */
  let pickerBudget: number | undefined

  /** The result the card was last rendered for, so repeated notifications do not recompute the matrix. */
  let shownResult: AppState['result']

  function renderBudgetPicker(state: Readonly<AppState>): void {
    // The options change only when the budget in effect is one the presets
    // lack, so they are rebuilt on a budget change rather than every render.
    if (pickerBudget !== state.budgetBytes) {
      pickerBudget = state.budgetBytes
      fillPicker(
        elements.budget,
        budgetEntries(state.budgetBytes).map(({ value, label }) => ({ value, label })),
      )
    }
    const value = String(state.budgetBytes)
    // Setting the value from code fires no `change`, so this cannot loop; it
    // is also what puts the picker back after a failed reload.
    if (elements.budget.value !== value) {
      elements.budget.value = value
    }
    elements.budget.disabled = !canReloadInputs(state)
  }

  function renderSummary(state: Readonly<AppState>): void {
    const visible = hasResult(state) && hasInputs(state)
    elements.summary.hidden = !visible
    if (!visible) {
      shownResult = undefined
      elements.copyParameters.value = ''
      return
    }
    if (state.result === shownResult) {
      return
    }
    shownResult = state.result
    const summary = summarizeRegistration(state.result, state.fixed, state.moving)
    elements.summaryBrief.textContent = summaryBrief(summary)
    renderSummaryList(elements.summaryList, summaryFields(summary))
    renderMatrixTable(elements.matrix, summary)
    elements.copyParameters.value = summary.parametersText
  }

  function render(state: Readonly<AppState>): void {
    const value = String(state.numberOfResolutions)
    if (elements.resolutions.value !== value) {
      elements.resolutions.value = value
    }
    elements.resolutions.disabled = state.registering || state.reloading
    renderBudgetPicker(state)
    elements.cancel.disabled = !canCancelRegistration(state)
    renderSummary(state)
  }

  const bag = createListenerBag()
  // `wa-select` fires `change` on the host, with the chosen option's value,
  // for user selection only.
  bag.listen(elements.resolutions, 'change', () => {
    store.update(resolutionsChosen(elements.resolutions.value))
  })
  bag.listen(elements.budget, 'change', () => {
    const bytes = budgetBytesForValue(elements.budget.value)
    if (bytes === undefined) {
      return
    }
    if (bytes !== store.state.budgetBytes) {
      handlers.onBudgetChosen?.(bytes)
    }
  })
  bag.listen(elements.cancel, 'click', () => handlers.onCancel?.())

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
