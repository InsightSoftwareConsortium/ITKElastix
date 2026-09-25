// A registration run, started for every pair once it is on screen and
// again by the Register button: run elastix on the loaded pair with the
// number of resolutions the store holds while the status row shows an
// indeterminate progress bar, the stage label, and a running elapsed
// timer; then store the result (which the shell displays) and report
// success or failure in a callout. The Cancel button's behaviour is the
// flow's `cancel()`: it aborts the run's signal, which the runner answers
// by terminating the elastix worker, and the store returns to idle with
// any earlier result kept.
//
// The runner is injected so this module never imports the elastix pipeline;
// the node unit tests drive it with a stand-in.
import { formatElapsed } from '../format.ts'
import { AFFINE_STAGES_LABEL, type RegisterFunction, type RegistrationResult } from '../registration/types.ts'
import { canRegister, registrationFailed, registrationStarted, resultReady, type AppStore } from '../state.ts'
import { errorMessage } from './notify-options.ts'
import type { Shell } from './shell.ts'

export interface RegisterFlowOptions {
  /** Runs the registration; `registerAffine` in the app. */
  register: RegisterFunction
  /** Refresh period of the elapsed timer, in milliseconds. */
  tickMs?: number
}

export type RegisterFlowShell = Pick<Shell, 'setStatus' | 'settled'>

export interface RegisterFlow {
  /**
   * Register the loaded pair. Calling it while a run or a reload is
   * active, or without both inputs, does nothing.
   */
  run(): Promise<void>
  /**
   * The action behind the Cancel button: abort the active run, if any. The
   * run's promise settles once the store is back to idle.
   */
  cancel(): void
}

/** Returns the actions that start and cancel a run. */
export function createRegisterFlow(
  store: AppStore,
  shell: RegisterFlowShell,
  { register, tickMs = 100 }: RegisterFlowOptions,
): RegisterFlow {
  /** The controller of the active run; null while idle. */
  let active: AbortController | null = null

  async function run(): Promise<void> {
    const { fixed, moving, numberOfResolutions } = store.state
    if (!fixed || !moving || !canRegister(store.state) || active !== null) {
      return
    }

    const controller = new AbortController()
    active = controller
    store.update(registrationStarted())
    const startedAt = performance.now()
    let stageMessage = `Registering ${AFFINE_STAGES_LABEL}…`
    const tick = () => {
      shell.setStatus({ message: `${stageMessage} ${formatElapsed(performance.now() - startedAt)}`, busy: true })
    }
    tick()
    const timer = setInterval(tick, tickMs)

    let result: RegistrationResult
    try {
      result = await register(
        fixed.itkImage,
        moving.itkImage,
        { numberOfResolutions, signal: controller.signal },
        (status) => {
          if (status.stage !== 'done') {
            stageMessage = status.message
            tick()
          }
        },
      )
    } catch (error) {
      store.update(registrationFailed())
      if (controller.signal.aborted) {
        shell.setStatus({
          message: `Registration cancelled after ${formatElapsed(performance.now() - startedAt)}. Press Register to start again.`,
        })
        return
      }
      shell.setStatus({ message: `Registration failed: ${errorMessage(error)}`, variant: 'danger' })
      return
    } finally {
      clearInterval(timer)
      active = null
    }

    // A runner that resolves anyway after the signal fired (a stand-in, or
    // elastix finishing in the same tick) has produced a result nobody
    // asked for.
    if (controller.signal.aborted) {
      store.update(registrationFailed())
      shell.setStatus({ message: 'Registration cancelled. Press Register to start again.' })
      return
    }

    // Inputs can only change through the (disabled) Load images button or a
    // programmatic load; either way the result belongs to the old pair.
    if (store.state.fixed !== fixed || store.state.moving !== moving) {
      store.update(registrationFailed())
      shell.setStatus({
        message: 'The images changed while registering, so that result was discarded. Press Register again.',
        variant: 'warning',
      })
      return
    }

    store.update(resultReady(result))
    shell.setStatus({ message: 'Displaying the registered result…', busy: true })
    await shell.settled()
    shell.setStatus({
      message: `Registered in ${formatElapsed(result.elapsedMs)} (${AFFINE_STAGES_LABEL}). The right-hand comparison shows the result on the fixed grid beside the fixed image; the switch swaps it for the moving image.`,
      variant: 'success',
    })
  }

  function cancel(): void {
    active?.abort()
  }

  return { run, cancel }
}
