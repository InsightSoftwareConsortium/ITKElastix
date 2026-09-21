// Splash dialog: two input slots, fixed and moving, each filled from a
// bundled sample pair, a picked file, a dropped file or URL, or a typed
// URL, and run through the ingest pipeline with live progress. A loaded
// slot shows a summary of what elastix will receive; once both slots are
// filled the pair is checked, can be swapped, and is handed to the app by
// "Start". Sample buttons load both slots and start on their own. The
// dialog cannot be dismissed until the app holds a pair.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js'
import type WaDialog from '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import type WaInput from '@awesome.me/webawesome/dist/components/input/input.js'

import {
  assertCompatiblePair,
  loadImageSource,
  sourceName,
  type ImageSource,
  type LoadImageOptions,
  type LoadedImage,
} from '../io/load-image'
import type { Sample } from '../samples'
import { hasInputs, type AppStore } from '../state'
import { imageSummaryFields } from './image-summary'
import { requireElement } from './shell'
import {
  firstUrlFromList,
  pairError,
  roleLabel,
  SLOT_ROLES,
  swapSlots,
  urlSource,
  urlSourceFromText,
  type SlotRole,
  type Slots,
} from './splash-slots'
import { renderSummaryList } from './summary-list'

export { urlSource, type SlotRole, type Slots } from './splash-slots'

/** Signature of {@link loadImageSource}, for injecting a stand-in. */
export type ImageLoader = (source: ImageSource, options?: LoadImageOptions) => Promise<LoadedImage>

export interface SplashOptions {
  store: AppStore
  samples: readonly Sample[]
  /**
   * Receives both loaded images once `assertCompatiblePair` has accepted
   * them. Throwing rejects the pair: the dialog stays open and shows the
   * error. The dialog closes once this resolves.
   */
  onLoaded: (fixed: LoadedImage, moving: LoadedImage) => void | Promise<void>
  /** Defaults to {@link loadImageSource}; injectable for tests. */
  loadImage?: ImageLoader
  /**
   * Pixel budget passed to every load; the default of
   * {@link loadImageSource} applies when omitted.
   */
  budgetBytes?: number
}

export interface Splash {
  readonly dialog: WaDialog
  /** True while a slot is loading or the pair is being handed to the app. */
  readonly loading: boolean
  /** What the two slots hold, whether or not "Start" has been pressed. */
  readonly images: Readonly<Slots<LoadedImage | undefined>>
  open(): void
  close(): void
  /** Load `source` into one slot, as if the user had dropped it there. */
  loadSlot(role: SlotRole, source: ImageSource): Promise<void>
  /** Load both slots and, when both succeed, start: what a sample button does. */
  loadPair(fixed: ImageSource, moving: ImageSource): Promise<void>
  /** Exchange the two slots. */
  swap(): void
  /** Hand the loaded pair to the app and close: what "Start" does. */
  start(): Promise<void>
  destroy(): void
}

/** Element id of the button that loads a bundled sample pair. */
export function sampleButtonId(sample: Pick<Sample, 'id'>): string {
  return `sample-${sample.id}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The controls of one input slot; ids follow the `fixed-*` / `moving-*` pattern. */
interface SlotElements {
  /** The slot's box, which is also its drop zone. */
  zone: HTMLElement
  url: WaInput
  urlLoad: WaButton
  pick: WaButton
  file: HTMLInputElement
  status: HTMLElement
  statusText: HTMLElement
  summary: HTMLElement
}

type SlotStatus = 'empty' | 'loading' | 'loaded' | 'failed'

function slotElements(root: ParentNode, role: SlotRole): SlotElements {
  return {
    zone: requireElement(root, `#${role}-slot`),
    url: requireElement(root, `#${role}-url`),
    urlLoad: requireElement(root, `#${role}-url-load`),
    pick: requireElement(root, `#pick-${role}`),
    file: requireElement(root, `#${role}-file`),
    status: requireElement(root, `#${role}-status`),
    statusText: requireElement(root, `#${role}-status-text`),
    summary: requireElement(root, `#${role}-summary`),
  }
}

/** The source a drop carries: its first file, else its first URL. */
function droppedSource(transfer: DataTransfer | null): ImageSource | null {
  if (!transfer) {
    return null
  }
  const file = transfer.files[0]
  if (file) {
    return file
  }
  const url = firstUrlFromList(transfer.getData('text/uri-list') || transfer.getData('text/plain'))
  return url === null ? null : urlSource(url)
}

export function createSplash(root: ParentNode, options: SplashOptions): Splash {
  const { store, samples, onLoaded, budgetBytes } = options
  const loadImage = options.loadImage ?? loadImageSource

  const dialog = requireElement<WaDialog>(root, '#splash')
  const sampleButtons = requireElement<HTMLElement>(root, '#sample-buttons')
  const swapButton = requireElement<WaButton>(root, '#swap-images')
  const startButton = requireElement<WaButton>(root, '#start-registration-inputs')
  const errorCallout = requireElement<WaCallout>(root, '#splash-error')
  const slots: Slots<SlotElements> = { fixed: slotElements(root, 'fixed'), moving: slotElements(root, 'moving') }

  let images: Slots<LoadedImage | undefined> = { fixed: undefined, moving: undefined }
  /** Status text kept after a failed load, until the slot is loaded again. */
  let failures: Slots<string | null> = { fixed: null, moving: null }
  /** The slot whose load is in progress; its status line is owned by that load. */
  let loadingRole: SlotRole | null = null
  /** True while a load or the hand-over to the app is in progress. */
  let busy = false
  /** The pair-check message currently in the callout, so refreshes only touch it on change. */
  let shownPairError: string | null = null

  // Event listeners are collected so destroy() can remove them all.
  const listeners: [EventTarget, string, EventListener][] = []
  function listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler)
    listeners.push([target, type, handler])
  }

  // Sample buttons, one per manifest entry, each with its description.
  const sampleEntries = samples.map((sample) => {
    const entry = document.createElement('div')
    entry.className = 'splash-sample'
    const button = document.createElement('wa-button')
    button.id = sampleButtonId(sample)
    button.dataset.sampleId = sample.id
    button.appearance = 'filled'
    button.textContent = sample.label
    button.addEventListener('click', () => {
      void loadPair(urlSource(sample.fixed), urlSource(sample.moving))
    })
    const description = document.createElement('span')
    description.className = 'splash-sample-description'
    description.textContent = sample.description
    entry.append(button, description)
    sampleButtons.appendChild(entry)
    return { entry, button }
  })

  function showError(message: string | null): void {
    errorCallout.hidden = message === null
    errorCallout.textContent = message ?? ''
    if (message !== null) {
      // The dialog body scrolls once both summaries are shown; bring the
      // message into view rather than leaving it below the fold.
      errorCallout.scrollIntoView({ block: 'nearest' })
    }
  }

  /** Add a line to the callout, keeping what it already shows. */
  function appendError(message: string): void {
    showError(errorCallout.hidden ? message : `${errorCallout.textContent}\n${message}`)
  }

  function setSlotStatus(role: SlotRole, state: SlotStatus, text: string): void {
    const slot = slots[role]
    slot.status.dataset.state = state
    slot.status.hidden = state === 'loaded'
    slot.statusText.textContent = text
  }

  function renderSlot(role: SlotRole): void {
    const slot = slots[role]
    const image = images[role]
    const failure = failures[role]
    slot.summary.hidden = image === undefined
    renderSummaryList(slot.summary, image ? imageSummaryFields(image) : [])
    if (loadingRole === role) {
      return
    }
    if (image) {
      setSlotStatus(role, 'loaded', '')
    } else if (failure !== null) {
      setSlotStatus(role, 'failed', failure)
    } else {
      setSlotStatus(role, 'empty', 'Nothing loaded yet')
    }
  }

  /** The dialog may close only when the app holds a pair and nothing is in progress. */
  function closable(): boolean {
    return !busy && hasInputs(store.state)
  }

  /** Bring every control in line with the slots, the pair check, and `busy`. */
  function refresh(): void {
    for (const role of SLOT_ROLES) {
      renderSlot(role)
    }
    const pair = pairError(images.fixed, images.moving)
    if (pair !== shownPairError) {
      shownPairError = pair
      showError(pair)
    }
    for (const role of SLOT_ROLES) {
      const slot = slots[role]
      slot.pick.disabled = busy
      slot.urlLoad.disabled = busy || urlSourceFromText(slot.url.value) === null
    }
    for (const { button } of sampleEntries) {
      button.disabled = busy
    }
    swapButton.disabled = busy || (images.fixed === undefined && images.moving === undefined)
    startButton.disabled = busy || images.fixed === undefined || images.moving === undefined || pair !== null
    dialog.toggleAttribute('data-locked', !closable())
  }

  function setBusy(value: boolean): void {
    busy = value
    refresh()
  }

  /** Clear the callout before a new attempt; the pair check re-shows itself if still true. */
  function clearErrors(): void {
    shownPairError = null
    showError(null)
  }

  /**
   * Load `source` into one slot, reporting progress on its status line.
   * The slot is emptied first, so a failure leaves it empty with the
   * reason in the callout. Resolves to whether the load succeeded.
   */
  async function loadInto(role: SlotRole, source: ImageSource): Promise<boolean> {
    loadingRole = role
    failures = { ...failures, [role]: null }
    images = { ...images, [role]: undefined }
    renderSlot(role)
    setSlotStatus(role, 'loading', 'Starting…')
    try {
      const image = await loadImage(source, {
        budgetBytes,
        onProgress: (update) => setSlotStatus(role, 'loading', update.message),
      })
      images = { ...images, [role]: image }
      return true
    } catch (error) {
      failures = { ...failures, [role]: `Failed to load ${sourceName(source)}` }
      appendError(`${roleLabel(role)} image: ${errorMessage(error)}`)
      return false
    } finally {
      loadingRole = null
      refresh()
    }
  }

  async function loadSlot(role: SlotRole, source: ImageSource): Promise<void> {
    if (busy) {
      return
    }
    clearErrors()
    setBusy(true)
    try {
      await loadInto(role, source)
    } finally {
      setBusy(false)
    }
  }

  async function loadPair(fixedSource: ImageSource, movingSource: ImageSource): Promise<void> {
    if (busy) {
      return
    }
    clearErrors()
    setBusy(true)
    let loaded = false
    try {
      // Load one image at a time: two concurrent `readImage` calls for the
      // same format deadlock the second one inside @itk-wasm/image-io (seen
      // with the CT pair: the moving image never left "Decoding…"). Both
      // loads still run so the user sees every failure at once.
      const fixedLoaded = await loadInto('fixed', fixedSource)
      const movingLoaded = await loadInto('moving', movingSource)
      loaded = fixedLoaded && movingLoaded
    } finally {
      setBusy(false)
    }
    if (loaded) {
      await start()
    }
  }

  async function start(): Promise<void> {
    const { fixed, moving } = images
    if (busy || !fixed || !moving) {
      return
    }
    setBusy(true)
    try {
      // The pair check has already been shown on load; this keeps a
      // programmatic caller honest and turns a hand-over failure into a
      // callout with the previous inputs untouched.
      assertCompatiblePair(fixed, moving)
      await onLoaded(fixed, moving)
    } catch (error) {
      showError(errorMessage(error))
      return
    } finally {
      setBusy(false)
    }
    close()
  }

  function swap(): void {
    if (busy) {
      return
    }
    images = swapSlots(images)
    failures = swapSlots(failures)
    // The URL fields keep describing their slots.
    const fixedUrl = slots.fixed.url.value
    slots.fixed.url.value = slots.moving.url.value
    slots.moving.url.value = fixedUrl
    refresh()
  }

  /**
   * Open on the pair the app holds, if any, so a reopened dialog starts
   * from what is displayed; a swap or partial load abandoned by closing
   * the dialog is discarded.
   */
  function open(): void {
    if (hasInputs(store.state)) {
      images = { fixed: store.state.fixed, moving: store.state.moving }
    }
    failures = { fixed: null, moving: null }
    clearErrors()
    refresh()
    dialog.open = true
  }

  function close(): void {
    dialog.open = false
  }

  listen(dialog, 'wa-hide', (event) => {
    if (!closable()) {
      event.preventDefault()
    }
  })
  listen(swapButton, 'click', swap)
  listen(startButton, 'click', () => {
    void start()
  })

  for (const role of SLOT_ROLES) {
    const slot = slots[role]

    listen(slot.pick, 'click', () => slot.file.click())
    listen(slot.file, 'change', () => {
      const file = slot.file.files?.[0]
      // Reset so choosing the same file again fires another change.
      slot.file.value = ''
      if (file) {
        void loadSlot(role, file)
      }
    })

    const loadFromUrl = () => {
      const source = urlSourceFromText(slot.url.value)
      if (source) {
        void loadSlot(role, source)
      }
    }
    listen(slot.urlLoad, 'click', loadFromUrl)
    listen(slot.url, 'input', refresh)
    listen(slot.url, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        event.preventDefault()
        loadFromUrl()
      }
    })

    // The slot box is a drop zone for a file or a URL.
    const onDragOver = (event: Event) => {
      const drag = event as DragEvent
      drag.preventDefault()
      if (drag.dataTransfer) {
        drag.dataTransfer.dropEffect = busy ? 'none' : 'copy'
      }
      slot.zone.toggleAttribute('data-dragover', !busy)
    }
    listen(slot.zone, 'dragenter', onDragOver)
    listen(slot.zone, 'dragover', onDragOver)
    listen(slot.zone, 'dragleave', (event) => {
      // Moving between children of the zone also fires dragleave.
      const next = (event as DragEvent).relatedTarget
      if (!(next instanceof Node && slot.zone.contains(next))) {
        slot.zone.removeAttribute('data-dragover')
      }
    })
    listen(slot.zone, 'drop', (event) => {
      const drag = event as DragEvent
      drag.preventDefault()
      slot.zone.removeAttribute('data-dragover')
      if (busy) {
        return
      }
      const source = droppedSource(drag.dataTransfer)
      if (source) {
        void loadSlot(role, source)
      }
    })
  }

  // A file dropped anywhere else would navigate the page away from the
  // app; refuse it unless a slot has already claimed the drop.
  listen(window, 'dragover', (event) => {
    if (!event.defaultPrevented) {
      event.preventDefault()
      const transfer = (event as DragEvent).dataTransfer
      if (transfer) {
        transfer.dropEffect = 'none'
      }
    }
  })
  listen(window, 'drop', (event) => {
    if (!event.defaultPrevented) {
      event.preventDefault()
    }
  })

  const unsubscribe = store.subscribe(refresh)
  refresh()

  return {
    dialog,
    get loading() {
      return busy
    },
    get images() {
      return images
    },
    open,
    close,
    loadSlot,
    loadPair,
    swap,
    start,
    destroy() {
      unsubscribe()
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler)
      }
      for (const { entry } of sampleEntries) {
        entry.remove()
      }
    },
  }
}
