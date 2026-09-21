// Splash dialog: picks a bundled sample pair or two user files, runs both
// through the ingest pipeline with live progress, and hands the loaded pair
// to the app. The dialog cannot be dismissed until both inputs exist.
import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'
import type WaCallout from '@awesome.me/webawesome/dist/components/callout/callout.js'
import type WaDialog from '@awesome.me/webawesome/dist/components/dialog/dialog.js'

import {
  loadImageSource,
  nameFromUrl,
  type ImageSource,
  type LoadProgress,
  type LoadedImage,
} from '../io/load-image'
import type { Sample } from '../samples'
import { hasInputs, type AppStore } from '../state'
import { requireElement } from './shell'

export type ImageLoader = (source: ImageSource, onProgress?: (progress: LoadProgress) => void) => Promise<LoadedImage>

export interface SplashOptions {
  store: AppStore
  samples: readonly Sample[]
  /**
   * Receives both loaded images. Throwing rejects the pair: the dialog stays
   * open and shows the error. The dialog closes once this resolves.
   */
  onLoaded: (fixed: LoadedImage, moving: LoadedImage) => void | Promise<void>
  /** Defaults to {@link loadImageSource}; injectable for tests. */
  loadImage?: ImageLoader
}

export interface Splash {
  readonly dialog: WaDialog
  /** True while a pair is being loaded. */
  readonly loading: boolean
  open(): void
  close(): void
  /** Load `fixed` and `moving` as if the user had chosen them. */
  loadPair(fixed: ImageSource, moving: ImageSource): Promise<void>
  destroy(): void
}

/** Element id of the button that loads a bundled sample pair. */
export function sampleButtonId(sample: Pick<Sample, 'id'>): string {
  return `sample-${sample.id}`
}

/** A URL sample entry as an ingest source with an explicit file name. */
export function urlSource(url: string): ImageSource {
  return { url, name: nameFromUrl(url) }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Run `task` and report its outcome instead of throwing. */
async function settle<T>(task: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: 'fulfilled', value: await task() }
  } catch (reason) {
    return { status: 'rejected', reason }
  }
}

export function createSplash(root: ParentNode, options: SplashOptions): Splash {
  const { store, samples, onLoaded } = options
  const loadImage = options.loadImage ?? loadImageSource

  const dialog = requireElement<WaDialog>(root, '#splash')
  const sampleButtons = requireElement<HTMLElement>(root, '#sample-buttons')
  const pickFixed = requireElement<WaButton>(root, '#pick-fixed')
  const pickMoving = requireElement<WaButton>(root, '#pick-moving')
  const fixedInput = requireElement<HTMLInputElement>(root, '#fixed-file')
  const movingInput = requireElement<HTMLInputElement>(root, '#moving-file')
  const fixedFileName = requireElement<HTMLElement>(root, '#fixed-file-name')
  const movingFileName = requireElement<HTMLElement>(root, '#moving-file-name')
  const start = requireElement<WaButton>(root, '#start')
  const progress = requireElement<HTMLElement>(root, '#splash-progress')
  const progressFixed = requireElement<HTMLElement>(root, '#splash-progress-fixed')
  const progressMoving = requireElement<HTMLElement>(root, '#splash-progress-moving')
  const errorCallout = requireElement<WaCallout>(root, '#splash-error')

  let loading = false

  // Sample buttons, one per manifest entry.
  const sampleButtonElements = samples.map((sample) => {
    const button = document.createElement('wa-button')
    button.id = sampleButtonId(sample)
    button.dataset.sampleId = sample.id
    button.appearance = 'filled'
    button.textContent = sample.label
    button.addEventListener('click', () => {
      void loadPair(urlSource(sample.fixed), urlSource(sample.moving))
    })
    sampleButtons.appendChild(button)
    return button
  })

  function chosenFiles(): { fixed: File | null; moving: File | null } {
    return { fixed: fixedInput.files?.[0] ?? null, moving: movingInput.files?.[0] ?? null }
  }

  function updateFilePickers(): void {
    const { fixed, moving } = chosenFiles()
    fixedFileName.textContent = fixed ? fixed.name : 'No file chosen'
    movingFileName.textContent = moving ? moving.name : 'No file chosen'
    start.disabled = loading || fixed === null || moving === null
  }

  /** The dialog may close only when both inputs exist and nothing is loading. */
  function closable(): boolean {
    return !loading && hasInputs(store.state)
  }

  function updateLock(): void {
    dialog.toggleAttribute('data-locked', !closable())
  }

  function setLoading(value: boolean): void {
    loading = value
    for (const button of [...sampleButtonElements, pickFixed, pickMoving]) {
      button.disabled = value
    }
    progress.hidden = !value
    if (value) {
      progressFixed.textContent = 'Fixed: waiting…'
      progressMoving.textContent = 'Moving: waiting…'
    }
    updateFilePickers()
    updateLock()
  }

  function showError(message: string | null): void {
    errorCallout.hidden = message === null
    errorCallout.textContent = message ?? ''
  }

  async function loadOne(role: 'Fixed' | 'Moving', source: ImageSource, line: HTMLElement): Promise<LoadedImage> {
    line.textContent = `${role}: starting…`
    const image = await loadImage(source, (update) => {
      line.textContent = `${role}: ${update.message}`
    })
    line.textContent = `${role}: ${image.name} ready (${image.dimension}D ${image.itkImage.size.join('×')})`
    return image
  }

  async function loadPair(fixedSource: ImageSource, movingSource: ImageSource): Promise<void> {
    if (loading) {
      return
    }
    showError(null)
    setLoading(true)
    try {
      // Load one image at a time: two concurrent `readImage` calls for the
      // same format deadlock the second one inside @itk-wasm/image-io (seen
      // with the CT pair: the moving image never left "Decoding…"). Both
      // loads still run so the user sees every failure at once.
      const fixedOutcome = await settle(() => loadOne('Fixed', fixedSource, progressFixed))
      const movingOutcome = await settle(() => loadOne('Moving', movingSource, progressMoving))
      const failures: string[] = []
      if (fixedOutcome.status === 'rejected') {
        failures.push(`Fixed image: ${errorMessage(fixedOutcome.reason)}`)
        progressFixed.textContent = 'Fixed: failed'
      }
      if (movingOutcome.status === 'rejected') {
        failures.push(`Moving image: ${errorMessage(movingOutcome.reason)}`)
        progressMoving.textContent = 'Moving: failed'
      }
      if (fixedOutcome.status !== 'fulfilled' || movingOutcome.status !== 'fulfilled') {
        showError(failures.join('\n'))
        return
      }
      try {
        await onLoaded(fixedOutcome.value, movingOutcome.value)
      } catch (error) {
        showError(errorMessage(error))
        return
      }
    } finally {
      setLoading(false)
    }
    close()
  }

  function open(): void {
    updateFilePickers()
    updateLock()
    dialog.open = true
  }

  function close(): void {
    dialog.open = false
  }

  const onHide = (event: Event) => {
    if (!closable()) {
      event.preventDefault()
    }
  }
  const onPickFixed = () => fixedInput.click()
  const onPickMoving = () => movingInput.click()
  const onStart = () => {
    const { fixed, moving } = chosenFiles()
    if (fixed && moving) {
      void loadPair(fixed, moving)
    }
  }
  dialog.addEventListener('wa-hide', onHide)
  pickFixed.addEventListener('click', onPickFixed)
  pickMoving.addEventListener('click', onPickMoving)
  fixedInput.addEventListener('change', updateFilePickers)
  movingInput.addEventListener('change', updateFilePickers)
  start.addEventListener('click', onStart)
  const unsubscribe = store.subscribe(updateLock)

  updateFilePickers()
  updateLock()

  return {
    dialog,
    get loading() {
      return loading
    },
    open,
    close,
    loadPair,
    destroy() {
      unsubscribe()
      dialog.removeEventListener('wa-hide', onHide)
      pickFixed.removeEventListener('click', onPickFixed)
      pickMoving.removeEventListener('click', onPickMoving)
      fixedInput.removeEventListener('change', updateFilePickers)
      movingInput.removeEventListener('change', updateFilePickers)
      start.removeEventListener('click', onStart)
      for (const button of sampleButtonElements) {
        button.remove()
      }
    },
  }
}
