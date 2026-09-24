// Application state: the two loaded inputs, the registration result, the
// registration options (resolutions and the pixel budget the inputs were
// loaded under), whether a run or a budget reload is in progress, the
// result switch, the download formats chosen in the pickers, and which
// outputs are being written, held in a tiny synchronous store the shell
// renders from. Keep this module free of DOM access so the node unit tests
// can exercise it.
import type { Image } from 'itk-wasm'

import {
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_TRANSFORM_FORMAT,
  isImageFormatId,
  isTransformFormatId,
  type ImageFormatId,
  type TransformFormatId,
} from './io/formats.ts'
import type { LoadedImage } from './io/load-image'
import { PIXEL_BUDGET_BYTES } from './io/scale-select.ts'
import { DEFAULT_NUMBER_OF_RESOLUTIONS, type RegistrationResult } from './registration/types.ts'
import { clampResolutions } from './ui/registration-options.ts'

/** The two outputs a registration result can be downloaded as. */
export type OutputKind = 'image' | 'transform'

/** Both output kinds, in toolbar order. */
export const OUTPUT_KINDS: readonly OutputKind[] = ['image', 'transform']

export interface AppState {
  fixed?: LoadedImage
  moving?: LoadedImage
  result?: RegistrationResult
  /** Whether the result comparison shows the registered result instead of the moving input. */
  showResult: boolean
  /** True while elastix is running; blocks another run and input changes. */
  registering: boolean
  /** True while both inputs are being loaded again under a new pixel budget; blocks runs and input changes. */
  reloading: boolean
  /** Multi-resolution pyramid levels per elastix stage for the next run (elastix `NumberOfResolutions`). */
  numberOfResolutions: number
  /**
   * Pixel budget, in bytes, the loaded inputs were read under and any new
   * input will be read under. Changed only by a completed budget reload.
   */
  budgetBytes: number
  /** Format the registered image is downloaded in: an id from src/io/formats.ts. */
  imageFormat: ImageFormatId
  /** Format the fixed-to-moving transform is downloaded in: an id from src/io/formats.ts. */
  transformFormat: TransformFormatId
  /** Outputs being written for download; each blocks its own button until done. */
  writing: Readonly<Record<OutputKind, boolean>>
}

/** Called after every update with the new state and the one it replaced. */
export type StateListener = (state: Readonly<AppState>, previous: Readonly<AppState>) => void

/** Fields to merge into the state, or a function computing them from the current state. */
export type StatePatch = Partial<AppState> | ((state: Readonly<AppState>) => Partial<AppState>)

export interface AppStore {
  /** The current state. Treat it as immutable; use {@link update} to change it. */
  readonly state: Readonly<AppState>
  /** Merge `patch` into the state and notify every subscriber synchronously. */
  update(patch: StatePatch): Readonly<AppState>
  /** Register `listener`; the returned function removes it again. */
  subscribe(listener: StateListener): () => void
}

export interface StoreOptions {
  /**
   * Receives an exception a listener threw while being notified. The
   * remaining listeners are still notified and the state stays as
   * updated. Defaults to logging it; the app reports it in a toast.
   */
  onError?: (error: unknown) => void
}

function logListenerError(error: unknown): void {
  console.error('A state listener failed', error)
}

export function createStore(
  initial: Partial<AppState> = {},
  { onError = logListenerError }: StoreOptions = {},
): AppStore {
  let state: Readonly<AppState> = {
    showResult: false,
    registering: false,
    reloading: false,
    numberOfResolutions: DEFAULT_NUMBER_OF_RESOLUTIONS,
    budgetBytes: PIXEL_BUDGET_BYTES,
    imageFormat: DEFAULT_IMAGE_FORMAT.id,
    transformFormat: DEFAULT_TRANSFORM_FORMAT.id,
    writing: { image: false, transform: false },
    ...initial,
  }
  const listeners = new Set<StateListener>()

  return {
    get state() {
      return state
    },
    update(patch) {
      const previous = state
      const changes = typeof patch === 'function' ? patch(previous) : patch
      state = { ...previous, ...changes }
      // Copy so a listener that unsubscribes (or subscribes) mid-notify does
      // not disturb the iteration.
      for (const listener of [...listeners]) {
        // One listener failing must not leave the others unrendered.
        try {
          listener(state, previous)
        } catch (error) {
          onError(error)
        }
      }
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Both inputs are loaded. */
export function hasInputs(
  state: Readonly<AppState>,
): state is Readonly<AppState & { fixed: LoadedImage; moving: LoadedImage }> {
  return state.fixed !== undefined && state.moving !== undefined
}

/** A registration result exists. */
export function hasResult(state: Readonly<AppState>): state is Readonly<AppState & { result: RegistrationResult }> {
  return state.result !== undefined
}

/** Registration may be started: both inputs are loaded, no run is active, and no reload is replacing them. */
export function canRegister(state: Readonly<AppState>): boolean {
  return hasInputs(state) && !state.registering && !state.reloading
}

/** A run may be cancelled: one is active. */
export function canCancelRegistration(state: Readonly<AppState>): boolean {
  return state.registering
}

/** Inputs may be (re)loaded: no registration is running against them and no reload is already under way. */
export function canLoadInputs(state: Readonly<AppState>): boolean {
  return !state.registering && !state.reloading
}

/**
 * The inputs may be loaded again under another pixel budget: both are
 * loaded, both remember the File or URL they came from, and nothing else
 * is using them.
 */
export function canReloadInputs(state: Readonly<AppState>): boolean {
  return (
    hasInputs(state) &&
    state.fixed.source !== undefined &&
    state.moving.source !== undefined &&
    !state.registering &&
    !state.reloading
  )
}

/** Patch for the resolutions picker; the value is clamped to the picker's range (see `clampResolutions`). */
export function resolutionsChosen(value: unknown): Partial<AppState> {
  return { numberOfResolutions: clampResolutions(value) }
}

/** Patch for the start of a budget reload. */
export function reloadStarted(): Partial<AppState> {
  return { reloading: true }
}

/** Patch for a reload that ended without replacing the inputs; the budget in effect stays. */
export function reloadFailed(): Partial<AppState> {
  return { reloading: false }
}

/**
 * Patch for a completed budget reload: the freshly loaded pair (which, like
 * any new pair, drops the result and resets the result switch), the budget
 * it was read under, and the end of the reload.
 */
export function budgetApplied(fixed: LoadedImage, moving: LoadedImage, budgetBytes: number): Partial<AppState> {
  return { ...inputsLoaded(fixed, moving), budgetBytes, reloading: false }
}

/** The registered result is both available and selected for display. */
export function isShowingResult(state: Readonly<AppState>): boolean {
  return state.showResult && hasResult(state)
}

/**
 * Patch for a freshly loaded input pair. Any earlier result belongs to the
 * previous inputs, so it is dropped and the result switch reset.
 */
export function inputsLoaded(fixed: LoadedImage, moving: LoadedImage): Partial<AppState> {
  return { fixed, moving, result: undefined, showResult: false }
}

/** Patch for the start of a registration run. */
export function registrationStarted(): Partial<AppState> {
  return { registering: true }
}

/**
 * Patch for a completed registration: store the result, display it, and
 * end the run.
 */
export function resultReady(result: RegistrationResult): Partial<AppState> {
  return { result, showResult: true, registering: false }
}

/**
 * Patch for a registration that ended without a result. Any earlier result
 * is kept; it still belongs to the current inputs.
 */
export function registrationFailed(): Partial<AppState> {
  return { registering: false }
}

/** `kind` is being written for download. */
export function isWriting(state: Readonly<AppState>, kind: OutputKind): boolean {
  return state.writing[kind]
}

/** `kind` may be downloaded: a result exists and no download of it is being written. */
export function canDownload(state: Readonly<AppState>, kind: OutputKind): boolean {
  return hasResult(state) && !state.writing[kind]
}

/** The registry id of the format chosen for `kind`. */
export function selectedFormatId(state: Readonly<AppState>, kind: OutputKind): ImageFormatId | TransformFormatId {
  return kind === 'image' ? state.imageFormat : state.transformFormat
}

/**
 * Patch for a format picked for `kind`; `id` is the picker's value. Throws
 * on an id the registry does not list for that kind: the pickers are filled
 * from the registry, so an unknown value is a bug rather than user input.
 */
export function formatChosen(kind: OutputKind, id: string): Partial<AppState> {
  if (kind === 'image') {
    if (!isImageFormatId(id)) {
      throw new Error(`Unknown image format: ${id}`)
    }
    return { imageFormat: id }
  }
  if (!isTransformFormatId(id)) {
    throw new Error(`Unknown transform format: ${id}`)
  }
  return { transformFormat: id }
}

/** Patch for the start of writing `kind` for download. */
export function writingStarted(kind: OutputKind): StatePatch {
  return (state) => ({ writing: { ...state.writing, [kind]: true } })
}

/** Patch for the end of writing `kind`, whether or not it produced a file. */
export function writingFinished(kind: OutputKind): StatePatch {
  return (state) => ({ writing: { ...state.writing, [kind]: false } })
}

/** Name under which the registered result is displayed and exported. */
export const RESULT_NAME = 'registered'

/** What one viewer panel should display. */
export interface PanelContent {
  image: Image
  name: string
}

/** Content of the fixed side of either comparison: the fixed input, if loaded. */
export function fixedPanelContent(state: Readonly<AppState>): PanelContent | undefined {
  return state.fixed ? { image: state.fixed.itkImage, name: state.fixed.name } : undefined
}

/** Content of the moving side of the inputs comparison: the moving input, if loaded. */
export function movingPanelContent(state: Readonly<AppState>): PanelContent | undefined {
  return state.moving ? { image: state.moving.itkImage, name: state.moving.name } : undefined
}

/**
 * Content of the moving side of the result comparison: the registered
 * result while it is selected for display (it lives on the fixed grid),
 * otherwise the moving input.
 */
export function resultPanelContent(state: Readonly<AppState>): PanelContent | undefined {
  if (isShowingResult(state)) {
    return { image: state.result!.image, name: RESULT_NAME }
  }
  return movingPanelContent(state)
}
