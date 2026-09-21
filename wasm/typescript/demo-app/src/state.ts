// Application state: the two loaded inputs, the registration result, the
// display toggles (the result switch and overlay mode with its opacity),
// the download formats chosen in the pickers, and which outputs are being
// written, held in a tiny synchronous store the shell renders from. Keep this module free of DOM access so the node unit tests
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
import type { RegistrationResult } from './registration/types'
import { DEFAULT_OVERLAY_OPACITY, clampOpacity } from './viewer/overlay-options.ts'

/** The two outputs a registration result can be downloaded as. */
export type OutputKind = 'image' | 'transform'

/** Both output kinds, in toolbar order. */
export const OUTPUT_KINDS: readonly OutputKind[] = ['image', 'transform']

export interface AppState {
  fixed?: LoadedImage
  moving?: LoadedImage
  result?: RegistrationResult
  /** Whether the moving panel shows the registered result instead of the moving input. */
  showResult: boolean
  /** True while elastix is running; blocks another run and input changes. */
  registering: boolean
  /** Whether the fixed panel blends the moving panel's content over the fixed image (overlay mode). */
  overlay: boolean
  /** Opacity the overlay is blended at, 0 to 1. Outlives the inputs, like a colormap choice. */
  overlayOpacity: number
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

export function createStore(initial: Partial<AppState> = {}): AppStore {
  let state: Readonly<AppState> = {
    showResult: false,
    registering: false,
    overlay: false,
    overlayOpacity: DEFAULT_OVERLAY_OPACITY,
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
        listener(state, previous)
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

/** Registration may be started: both inputs are loaded and no run is active. */
export function canRegister(state: Readonly<AppState>): boolean {
  return hasInputs(state) && !state.registering
}

/** Inputs may be (re)loaded: no registration is running against them. */
export function canLoadInputs(state: Readonly<AppState>): boolean {
  return !state.registering
}

/** The registered result is both available and selected for display. */
export function isShowingResult(state: Readonly<AppState>): boolean {
  return state.showResult && hasResult(state)
}

/**
 * Patch for a freshly loaded input pair. Any earlier result belongs to the
 * previous inputs, so it is dropped and the display toggles reset; the
 * overlay opacity, a preference, stays.
 */
export function inputsLoaded(fixed: LoadedImage, moving: LoadedImage): Partial<AppState> {
  return { fixed, moving, result: undefined, showResult: false, overlay: false }
}

/** Overlay mode may be switched on: both inputs are loaded. */
export function canOverlay(state: Readonly<AppState>): boolean {
  return hasInputs(state)
}

/** Patch for the overlay switch. */
export function overlayToggled(overlay: boolean): Partial<AppState> {
  return { overlay }
}

/** Patch for the opacity slider; its value is clamped to 0..1 (see `clampOpacity`). */
export function overlayOpacityChanged(opacity: unknown): Partial<AppState> {
  return { overlayOpacity: clampOpacity(opacity) }
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

/** Content of the fixed panel: the fixed input, if loaded. */
export function fixedPanelContent(state: Readonly<AppState>): PanelContent | undefined {
  return state.fixed ? { image: state.fixed.itkImage, name: state.fixed.name } : undefined
}

/**
 * Content of the moving panel: the registered result while it is selected
 * for display (it lives on the fixed grid), otherwise the moving input.
 */
export function movingPanelContent(state: Readonly<AppState>): PanelContent | undefined {
  if (isShowingResult(state)) {
    return { image: state.result!.image, name: RESULT_NAME }
  }
  return state.moving ? { image: state.moving.itkImage, name: state.moving.name } : undefined
}

/**
 * Content blended over the fixed image while overlay mode is on: whatever
 * the moving panel shows, so the registered result while it is selected
 * for display and the moving input otherwise. Undefined while the mode is
 * off or the inputs are missing.
 */
export function overlayContent(state: Readonly<AppState>): PanelContent | undefined {
  return state.overlay && canOverlay(state) ? movingPanelContent(state) : undefined
}
