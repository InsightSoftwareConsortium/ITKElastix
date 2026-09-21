// Application shell: binds the header controls, status row, and the two
// niivue panels inside the split panel (markup in index.html) to the state
// store. Panels are rendered from state, so swapping the moving panel to the
// registered result is a state change, not a call into this module.
import type WaBadge from '@awesome.me/webawesome/dist/components/badge/badge.js'
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js'
import type WaProgressBar from '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import type WaSplitPanel from '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js'

import {
  canRegister,
  fixedPanelContent,
  hasResult,
  isShowingResult,
  movingPanelContent,
  type AppState,
  type AppStore,
  type PanelContent,
} from '../state'
import { createViewerPanel, type ViewerPanel } from '../viewer/panel'

export type StatusVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export interface StatusOptions {
  message: string
  /** Show the indeterminate progress bar next to the message. */
  busy?: boolean
  /** Anything but 'neutral' renders the message in a callout of that variant. */
  variant?: StatusVariant
}

/** Callbacks for the header buttons; missing ones leave the button inert. */
export interface ShellHandlers {
  onLoadImages?: () => void
  onRegister?: () => void
  onDownloadImage?: () => void
  onDownloadTransform?: () => void
}

export interface ShellElements {
  loadImages: WaButton
  register: WaButton
  showResult: WaSwitch
  downloadImage: WaButton
  downloadTransform: WaButton
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
    downloadImage: requireElement(root, '#download-image'),
    downloadTransform: requireElement(root, '#download-transform'),
    status: requireElement(root, '#status'),
    statusProgress: requireElement(root, '#status-progress'),
    statusMessage: requireElement(root, '#status-message'),
    statusCallout: requireElement(root, '#status-callout'),
    viewers: requireElement(root, '#viewers'),
    fixedCaption: requireElement(root, '#fixed-caption'),
    movingCaption: requireElement(root, '#moving-caption'),
  }

  const fixedPanel = await createViewerPanel(requireElement(root, '[data-panel="fixed"]'), 'Fixed', { role: 'fixed' })
  const movingPanel = await createViewerPanel(requireElement(root, '[data-panel="moving"]'), 'Moving', {
    role: 'moving',
  })

  function setStatus({ message, busy = false, variant = 'neutral' }: StatusOptions): void {
    elements.statusProgress.hidden = !busy
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

  function renderControls(state: Readonly<AppState>): void {
    const resultAvailable = hasResult(state)
    elements.register.disabled = !canRegister(state)
    elements.showResult.disabled = !resultAvailable
    elements.showResult.checked = isShowingResult(state)
    elements.downloadImage.disabled = !resultAvailable
    elements.downloadTransform.disabled = !resultAvailable

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

  const onLoadImages = () => handlers.onLoadImages?.()
  const onRegister = () => handlers.onRegister?.()
  const onDownloadImage = () => handlers.onDownloadImage?.()
  const onDownloadTransform = () => handlers.onDownloadTransform?.()
  const onShowResultChange = () => {
    store.update({ showResult: elements.showResult.checked })
  }
  elements.loadImages.addEventListener('click', onLoadImages)
  elements.register.addEventListener('click', onRegister)
  elements.downloadImage.addEventListener('click', onDownloadImage)
  elements.downloadTransform.addEventListener('click', onDownloadTransform)
  elements.showResult.addEventListener('change', onShowResultChange)

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
      elements.loadImages.removeEventListener('click', onLoadImages)
      elements.register.removeEventListener('click', onRegister)
      elements.downloadImage.removeEventListener('click', onDownloadImage)
      elements.downloadTransform.removeEventListener('click', onDownloadTransform)
      elements.showResult.removeEventListener('change', onShowResultChange)
      fixedPanel.destroy()
      movingPanel.destroy()
    },
  }
}
