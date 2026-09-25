// Renders summary fields (src/ui/image-summary.ts) as rows of a definition
// list; shared by the splash dialog's slot summaries and the viewer panels'
// image details.
import type { SummaryField } from './image-summary'

/**
 * Replace the children of `list` (a `<dl>`) with one row per field: a
 * `div.summary-row[data-field=key]` holding the `<dt>` label and `<dd>`
 * value. `data-field` gives tests a stable handle on each row.
 */
export function renderSummaryList(list: HTMLElement, fields: readonly SummaryField[]): void {
  list.replaceChildren(
    ...fields.map((field) => {
      const row = document.createElement('div')
      row.className = 'summary-row'
      row.dataset.field = field.key
      const term = document.createElement('dt')
      term.textContent = field.label
      const detail = document.createElement('dd')
      detail.textContent = field.value
      row.append(term, detail)
      return row
    }),
  )
}
