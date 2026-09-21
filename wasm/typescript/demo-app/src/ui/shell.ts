// Application shell: binds the header controls (including the two download
// format pickers with their buttons and tooltips), the status row, and the
// two niivue panels inside the split panel (markup in index.html) to the
// state store. Controls and panels are rendered from state, so swapping the
// moving panel to the registered result, choosing a format, or showing a
// button's spinner while its file is written is a state change, not a call
// into this module. A status of a success, warning, or danger variant is
// shown in the row in that colour and raised as a toast through the
// notifier (src/ui/notify.ts), so the flows report through `setStatus`
// alone. The two panels are linked so they navigate together
// (src/viewer/panel.ts), and a freshly loaded pair opens on the default
// view; the view controls in src/ui/view-controls.ts and the overlay in
// src/viewer/overlay.ts drive the rest.
import type WaBadge from '@awesome.me/webawesome/dist/components/badge/badge.js'
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
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
import { createViewerPanel, linkPanels, resetLinkedViews, type ViewerPanel } from '../viewer/panel'
import { formatTooltip, pickerFormats, progressPercent, selectedFormat, type ProgressCounts } from './download-controls'
import type { Notifier } from './notify'
import { errorMessage } from './notify-options'

export type StatusVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export interface StatusOptions {
  message: string
  /** Show the progress bar next to the message. */
  busy?: boolean
  /**
   * Anything but 'neutral' colours the message and raises it as a toast
   * of that variant (src/ui/notify.ts); the row keeps the text after the
   * toast has gone.
   */
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

/** What the shell is built with: the button callbacks and the notifier it reports through. */
export interface ShellOptions extends ShellHandlers {
  notify: Notifier
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
  viewers: WaSplitPanel
  fixedCaption: WaBadge
  movingCaption: WaBadge
}

export interface Shell {
  readonly elements: ShellElements
  readonly fixedPanel: ViewerPanel
  readonly movingPanel: ViewerPanel
  /** The notifier the shell raises its toasts through, for modules that report outside a status. */
  readonly notify: Notifier
  setStatus(options: StatusOptions): void
  /**
   * Resolves once every panel update queued so far has finished, the
   * shell's own and those other modules (the overlay) queued on the panels.
   */
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

/** One entry of a `wa-select`: the option's value and its visible label. */
export interface PickerEntry {
  value: string
  label: string
}

/**
 * Replace the options of `picker` with one `wa-option` per entry. Options
 * created after the component is defined are picked up in a microtask, and
 * a `value` set before that resolves once they exist.
 */
export function fillPicker(picker: WaSelect, entries: readonly PickerEntry[]): void {
  picker.replaceChildren(
    ...entries.map(({ value, label }) => {
      const option = document.createElement('wa-option')
      option.value = value
      option.textContent = label
      return option
    }),
  )
}

/** Fill `picker` with one `wa-option` per format of `kind`, valued by registry id. */
function fillFormatPicker(picker: WaSelect, kind: OutputKind): void {
  fillPicker(
    picker,
    pickerFormats(kind).map((format) => ({ value: format.id, label: format.label })),
  )
}

export interface ListenerBag {
  /** Add `handler` for `type` on `target`, remembering it for {@link removeAll}. */
  listen(target: EventTarget, type: string, handler: EventListener): void
  /** Remove every listener added through {@link listen}. */
  removeAll(): void
}

/** Collects event listeners so a module's `destroy()` can remove them together. */
export function createListenerBag(): ListenerBag {
  const listeners: [EventTarget, string, EventListener][] = []
  return {
    listen(target, type, handler) {
      target.addEventListener(type, handler)
      listeners.push([target, type, handler])
    },
    removeAll() {
      for (const [target, type, handler] of listeners.splice(0)) {
        target.removeEventListener(type, handler)
      }
    },
  }
}

function sameContent(a: PanelContent | undefined, b: PanelContent | undefined): boolean {
  return a?.image === b?.image && a?.name === b?.name
}

/**
 * Bind the shell markup under `root` to `store`, mount a niivue panel in each
 * half of the split panel, and keep the controls and panels in sync with
 * the state until `destroy()` is called.
 */
export async function createShell(root: ParentNode, store: AppStore, options: ShellOptions): Promise<Shell> {
  const { notify, ...handlers } = options
  const elements: ShellElements = {
    loadImages: requireElement(root, '#load-images'),
    register: requireElement(root, '#register'),
    showResult: requireElement(root, '#show-result'),
    downloads: { image: downloadElements(root, 'image'), transform: downloadElements(root, 'transform') },
    status: requireElement(root, '#status'),
    statusProgress: requireElement(root, '#status-progress'),
    statusMessage: requireElement(root, '#status-message'),
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
  // Either panel's navigation moves the other, from now until destroy().
  const unlinkPanels = linkPanels(fixedPanel, movingPanel)

  function setStatus({ message, busy = false, variant = 'neutral', progress }: StatusOptions): void {
    const bar = elements.statusProgress
    bar.hidden = !busy
    bar.indeterminate = progress === undefined
    bar.value = progress === undefined ? 0 : progressPercent(progress)
    elements.status.dataset.busy = String(busy)
    elements.status.dataset.variant = variant
    elements.statusMessage.textContent = message
    // The line is clipped to one row; a warning or failure, which can run
    // to several lines of elastix or writer output, keeps its full text
    // in the tooltip after its toast has gone.
    if (variant === 'warning' || variant === 'danger') {
      elements.statusMessage.title = message
    } else {
      elements.statusMessage.removeAttribute('title')
    }
    if (variant !== 'neutral') {
      // The row is a live region and has just announced the text itself.
      notify.show(message, { variant, announce: false })
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
        setStatus({
          message: `Could not display ${content?.name ?? 'image'} in the ${panel.label} panel: ${errorMessage(error)}`,
          variant: 'danger',
        })
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

  /**
   * Once both panels' queued updates are done, return them to the default
   * view, centred on the fixed image. Queued on both panels, so `settled()`
   * covers the reset too.
   */
  function queueViewReset(): void {
    const panels = [fixedPanel, movingPanel]
    const reset = Promise.all(panels.map((panel) => pending.get(panel) ?? Promise.resolve())).then(() => {
      resetLinkedViews(fixedPanel, movingPanel)
    })
    for (const panel of panels) {
      pending.set(panel, reset)
    }
  }

  function render(state: Readonly<AppState>): void {
    renderControls(state)
    queuePanelUpdate(fixedPanel, fixedPanelContent(state))
    queuePanelUpdate(movingPanel, movingPanelContent(state))
  }

  // Event listeners are collected so destroy() can remove them all.
  const bag = createListenerBag()

  bag.listen(elements.loadImages, 'click', () => handlers.onLoadImages?.())
  bag.listen(elements.register, 'click', () => handlers.onRegister?.())
  bag.listen(elements.showResult, 'change', () => {
    store.update({ showResult: elements.showResult.checked })
  })
  for (const kind of OUTPUT_KINDS) {
    const { format: picker, button } = elements.downloads[kind]
    bag.listen(button, 'click', () => handlers.onDownload?.(kind))
    // `wa-select` fires `change` on the host, with the chosen option's value.
    bag.listen(picker, 'change', () => {
      const value = picker.value
      if (typeof value === 'string') {
        store.update(formatChosen(kind, value))
      }
    })
  }

  const unsubscribe = store.subscribe((state, previous) => {
    render(state)
    // A new pair opens on the default view; the result toggle, which only
    // swaps the moving panel's volume, keeps the user's.
    if (state.fixed !== previous.fixed || state.moving !== previous.moving) {
      queueViewReset()
    }
  })
  render(store.state)

  return {
    elements,
    fixedPanel,
    movingPanel,
    notify,
    setStatus,
    async settled() {
      await Promise.all([...pending.values(), fixedPanel.settled(), movingPanel.settled()])
    },
    destroy() {
      unsubscribe()
      bag.removeAll()
      unlinkPanels()
      fixedPanel.destroy()
      movingPanel.destroy()
    },
  }
}
