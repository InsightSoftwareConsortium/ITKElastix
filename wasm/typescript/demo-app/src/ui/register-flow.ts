// The Register button's behaviour: run elastix on the loaded pair while the
// status row shows an indeterminate progress bar, the stage label, and a
// running elapsed timer; then store the result (which the shell displays)
// and report success or failure in a callout.
//
// The runner is injected so this module never imports the elastix pipeline;
// the node unit tests drive it with a stand-in.
import { formatElapsed } from '../format.ts'
import { AFFINE_STAGES_LABEL, type RegisterFunction, type RegistrationResult } from '../registration/types.ts'
import { canRegister, registrationFailed, registrationStarted, resultReady, type AppStore } from '../state.ts'
import type { Shell } from './shell.ts'

export interface RegisterFlowOptions {
  /** Runs the registration; `registerAffine` in the app. */
  register: RegisterFunction
  /** Refresh period of the elapsed timer, in milliseconds. */
  tickMs?: number
}

export type RegisterFlowShell = Pick<Shell, 'setStatus' | 'settled'>

/**
 * Returns the action behind the Register button. Calling it while a run is
 * active, or without both inputs, does nothing.
 */
export function createRegisterFlow(
  store: AppStore,
  shell: RegisterFlowShell,
  { register, tickMs = 100 }: RegisterFlowOptions,
): () => Promise<void> {
  return async function runRegistration(): Promise<void> {
    const { fixed, moving } = store.state
    if (!fixed || !moving || !canRegister(store.state)) {
      return
    }

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
      result = await register(fixed.itkImage, moving.itkImage, {}, (status) => {
        if (status.stage !== 'done') {
          stageMessage = status.message
          tick()
        }
      })
    } catch (error) {
      store.update(registrationFailed())
      const reason = error instanceof Error ? error.message : String(error)
      shell.setStatus({ message: `Registration failed: ${reason}`, variant: 'danger' })
      return
    } finally {
      clearInterval(timer)
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
      message: `Registered in ${formatElapsed(result.elapsedMs)} (${AFFINE_STAGES_LABEL}). The moving panel shows the result on the fixed grid; use the switch to compare.`,
      variant: 'success',
    })
  }
}
