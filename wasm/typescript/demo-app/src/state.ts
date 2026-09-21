// Application state: the two loaded inputs, the registration result, and the
// display toggle, held in a tiny synchronous store the shell renders from.
// Keep this module free of DOM access so the node unit tests can exercise it.
import type { Image } from 'itk-wasm'

import type { LoadedImage } from './io/load-image'
import type { RegistrationResult } from './registration/types'

export interface AppState {
  fixed?: LoadedImage
  moving?: LoadedImage
  result?: RegistrationResult
  /** Whether the moving panel shows the registered result instead of the moving input. */
  showResult: boolean
  /** True while elastix is running; blocks another run and input changes. */
  registering: boolean
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
  let state: Readonly<AppState> = { showResult: false, registering: false, ...initial }
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
 * previous inputs, so it is dropped and the display toggle reset.
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
