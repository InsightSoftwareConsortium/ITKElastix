// Application shell: binds the header controls (including the two download
// format pickers with their buttons and tooltips), the status row, and the
// two niivue panels inside the split panel (markup in index.html) to the
// state store. Controls and panels are rendered from state, so swapping the
// moving panel to the registered result, choosing a format, or showing a
// button's spinner while its file is written is a state change, not a call
// into this module.
import type WaBadge from '@awesome.me/webawesome/dist/components/badge/badge.js'
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js'
import type WaProgressBar from '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js'
import type WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js'
import type WaTooltip from '@awesome.me/webawesome/dist/components/tooltip/tooltip.js'

import {
  OUTPUT_KINDS,
  canDownload,
  canLoadInputs,
  canRegister,
  fixedPanelContent,
  formatChosen,
  hasResult,
  isShowingResult,
  isWriting,
  movingPanelContent,
  type AppState,
  type AppStore,
  type OutputKind,
  type PanelContent,
} from '../state'
import { createViewerPanel, type ViewerPanel } from '../viewer/panel'
import { formatTooltip, pickerFormats, progressPercent, selectedFormat, type ProgressCounts } from './download-controls'

export type StatusVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export interface StatusOptions {
  message: string
  /** Show the progress bar next to the message. */
  busy?: boolean
  /** Anything but 'neutral' renders the message in a callout of that variant. */
  variant?: StatusVariant
  /** Counts the progress bar is drawn from while `busy`; without them it is indeterminate. */
  progress?: ProgressCounts
}

/** Callbacks for the header buttons; missing ones leave the button inert. */
export interface ShellHandlers {
  onLoadImages?: () => void
  onRegister?: () => void
  /** The download button for `kind`; the format to write is read from the store. */
  onDownload?: (kind: OutputKind) => void
}

/** The controls of one download: the format picker, the button, and the button's tooltip. */
export interface DownloadElements {
  format: WaSelect
  button: WaButton
  tooltip: WaTooltip
}

export interface ShellElements {
  loadImages: WaButton
  register: WaButton
  showResult: WaSwitch
  /** Ids follow the `image-format` / `download-image` / `download-image-tooltip` pattern. */
  downloads: Readonly<Record<OutputKind, DownloadElements>>
  status: HTMLElement
  statusProgress: WaProgressBar
  statusMessage: HTMLElement
  statusCallout: WaCallout
  viewers: WaSplitPanel
  fixedCaption: WaBadge
  movingCaption: WaBadge
}

export interface Shell {
  readonly elements: ShellElements
  readonly fixedPanel: ViewerPanel
  readonly movingPanel: ViewerPanel
  setStatus(options: StatusOptions): void
  /** Resolves once every panel update queued so far has finished. */
  settled(): Promise<void>
  destroy(): void
}

export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing ${selector}`)
  }
  return element
}

function downloadElements(root: ParentNode, kind: OutputKind): DownloadElements {
  return {
    format: requireElement(root, `#${kind}-format`),
    button: requireElement(root, `#download-${kind}`),
    tooltip: requireElement(root, `#download-${kind}-tooltip`),
  }
}

/** Fill `picker` with one `wa-option` per format of `kind`, valued by registry id. */
function fillFormatPicker(picker: WaSelect, kind: OutputKind): void {
  picker.replaceChildren(
    ...pickerFormats(kind).map((format) => {
      const option = document.createElement('wa-option')
      option.value = format.id
      option.textContent = format.label
      return option
    }),
  )
}

function sameContent(a: PanelContent | undefined, b: PanelContent | undefined): boolean {
  return a?.image === b?.image && a?.name === b?.name
}

/**
 * Bind the shell markup under `root` to `store`, mount a niivue panel in each
 * half of the split panel, and keep the controls and panels in sync with
 * the state until `destroy()` is called.
 */
export async function createShell(root: ParentNode, store: AppStore, handlers: ShellHandlers = {}): Promise<Shell> {
  const elements: ShellElements = {
    loadImages: requireElement(root, '#load-images'),
    register: requireElement(root, '#register'),
    showResult: requireElement(root, '#show-result'),
    downloads: { image: downloadElements(root, 'image'), transform: downloadElements(root, 'transform') },
    status: requireElement(root, '#status'),
    statusProgress: requireElement(root, '#status-progress'),
    statusMessage: requireElement(root, '#status-message'),
    statusCallout: requireElement(root, '#status-callout'),
    viewers: requireElement(root, '#viewers'),
    fixedCaption: requireElement(root, '#fixed-caption'),
    movingCaption: requireElement(root, '#moving-caption'),
  }
  for (const kind of OUTPUT_KINDS) {
    fillFormatPicker(elements.downloads[kind].format, kind)
  }

  const fixedPanel = await createViewerPanel(requireElement(root, '[data-panel="fixed"]'), 'Fixed', { role: 'fixed' })
  const movingPanel = await createViewerPanel(requireElement(root, '[data-panel="moving"]'), 'Moving', {
    role: 'moving',
  })

  function setStatus({ message, busy = false, variant = 'neutral', progress }: StatusOptions): void {
    const bar = elements.statusProgress
    bar.hidden = !busy
    bar.indeterminate = progress === undefined
    bar.value = progress === undefined ? 0 : progressPercent(progress)
    elements.status.dataset.busy = String(busy)
    const useCallout = variant !== 'neutral'
    elements.statusMessage.hidden = useCallout
    elements.statusCallout.hidden = !useCallout
    if (useCallout) {
      elements.statusCallout.variant = variant
      elements.statusCallout.textContent = message
    } else {
      elements.statusMessage.textContent = message
    }
  }

  // One promise chain per panel keeps show/clear calls ordered even when the
  // state changes faster than niivue can load volumes. `shown` records the
  // content queued most recently so repeated notifications do not reload it.
  const shown = new Map<ViewerPanel, PanelContent | undefined>()
  const pending = new Map<ViewerPanel, Promise<void>>()

  function queuePanelUpdate(panel: ViewerPanel, content: PanelContent | undefined): void {
    if (sameContent(shown.get(panel), content)) {
      return
    }
    shown.set(panel, content)
    const previous = pending.get(panel) ?? Promise.resolve()
    const next = previous
      .then(() => (content ? panel.show(content.image, content.name) : panel.clear()))
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        setStatus({ message: `Could not display ${content?.name ?? 'image'} in the ${panel.label} panel: ${reason}`, variant: 'danger' })
      })
    pending.set(panel, next)
  }

  function renderDownload(state: Readonly<AppState>, kind: OutputKind): void {
    const { format: picker, button, tooltip } = elements.downloads[kind]
    const format = selectedFormat(state, kind)
    // Setting the value programmatically does not fire `change`, so this
    // cannot loop back into the store.
    if (picker.value !== format.id) {
      picker.value = format.id
    }
    button.disabled = !canDownload(state, kind)
    button.loading = isWriting(state, kind)
    const text = formatTooltip(kind, format)
    if (tooltip.textContent !== text) {
      tooltip.textContent = text
    }
  }

  function renderControls(state: Readonly<AppState>): void {
    elements.loadImages.disabled = !canLoadInputs(state)
    elements.register.disabled = !canRegister(state)
    elements.register.loading = state.registering
    elements.showResult.disabled = !hasResult(state)
    elements.showResult.checked = isShowingResult(state)
    for (const kind of OUTPUT_KINDS) {
      renderDownload(state, kind)
    }

    elements.fixedCaption.textContent = state.fixed ? `Fixed · ${state.fixed.name}` : 'Fixed'
    if (isShowingResult(state)) {
      elements.movingCaption.textContent = 'Registered · on the fixed grid'
      elements.movingCaption.variant = 'success'
    } else {
      elements.movingCaption.textContent = state.moving ? `Moving · ${state.moving.name}` : 'Moving'
      elements.movingCaption.variant = 'brand'
    }
  }

  function render(state: Readonly<AppState>): void {
    renderControls(state)
    queuePanelUpdate(fixedPanel, fixedPanelContent(state))
    queuePanelUpdate(movingPanel, movingPanelContent(state))
  }

  // Event listeners are collected so destroy() can remove them all.
  const listeners: [EventTarget, string, EventListener][] = []
  function listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler)
    listeners.push([target, type, handler])
  }

  listen(elements.loadImages, 'click', () => handlers.onLoadImages?.())
  listen(elements.register, 'click', () => handlers.onRegister?.())
  listen(elements.showResult, 'change', () => {
    store.update({ showResult: elements.showResult.checked })
  })
  for (const kind of OUTPUT_KINDS) {
    const { format: picker, button } = elements.downloads[kind]
    listen(button, 'click', () => handlers.onDownload?.(kind))
    // `wa-select` fires `change` on the host, with the chosen option's value.
    listen(picker, 'change', () => {
      const value = picker.value
      if (typeof value === 'string') {
        store.update(formatChosen(kind, value))
      }
    })
  }

  const unsubscribe = store.subscribe(render)
  render(store.state)

  return {
    elements,
    fixedPanel,
    movingPanel,
    setStatus,
    async settled() {
      await Promise.all(pending.values())
    },
    destroy() {
      unsubscribe()
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler)
      }
      fixedPanel.destroy()
      movingPanel.destroy()
    },
  }
}
