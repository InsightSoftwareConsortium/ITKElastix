// The budget picker's behaviour: load both inputs again from the File or
// URL each remembers, under the newly chosen pixel budget, through the
// same ingest pipeline the splash uses; then commit the pair and the
// budget to the store together (which drops the old result, as any new
// pair does) and report the outcome in the status row. While the reload
// runs the store's `reloading` flag disables Register, Load images, and
// the picker itself; a failure leaves the loaded pair and the budget in
// effect untouched, so the picker falls back to them when the shell
// renders. A warning the loader raises about an input (a very large image
// about to be downsampled) goes to a toast, since the row is showing the
// progress.
//
// The loader is injected so this module never imports the ingest pipeline;
// the node unit tests drive it with a stand-in.
import { formatBytes } from '../format.ts'
import type { LoadedImage } from '../io/load-image.ts'
import { assertCompatiblePair } from '../io/normalize.ts'
import { budgetApplied, canReloadInputs, reloadFailed, reloadStarted, type AppStore } from '../state.ts'
import { errorMessage } from './notify-options.ts'
import type { Shell } from './shell.ts'
import type { ImageLoader } from './splash.ts'
import { SLOT_ROLES, roleLabel, type SlotRole } from './splash-slots.ts'

export interface ReloadFlowOptions {
  /** Loads one image; `loadImageSource` in the app. */
  loadImage: ImageLoader
}

export type ReloadFlowShell = Pick<Shell, 'setStatus' | 'settled' | 'notify'>

export interface ReloadFlow {
  /**
   * The action behind the budget picker: load both inputs again under
   * `budgetBytes`. Does nothing while a run or another reload is active,
   * while an input has no source to reload from, or for the budget already
   * in effect.
   */
  reload(budgetBytes: number): Promise<void>
}

/** Returns the action behind the budget picker. */
export function createReloadFlow(store: AppStore, shell: ReloadFlowShell, { loadImage }: ReloadFlowOptions): ReloadFlow {
  async function reload(budgetBytes: number): Promise<void> {
    const { state } = store
    if (!canReloadInputs(state) || budgetBytes === state.budgetBytes) {
      return
    }
    const previous = { fixed: state.fixed!, moving: state.moving! }
    const budget = formatBytes(budgetBytes)

    store.update(reloadStarted())
    const loaded: Partial<Record<SlotRole, LoadedImage>> = {}
    try {
      // One image at a time: two concurrent ITK-Wasm reads of the same
      // format deadlock the second one (see src/ui/splash.ts).
      for (const role of SLOT_ROLES) {
        const source = previous[role].source!
        shell.setStatus({ message: `Reloading the ${roleLabel(role).toLowerCase()} image at ${budget}…`, busy: true })
        loaded[role] = await loadImage(source, {
          budgetBytes,
          onProgress: (update) => shell.setStatus({ message: `${roleLabel(role)}: ${update.message}`, busy: true }),
          onWarning: (message) => shell.notify.warning(message),
        })
      }
      const fixed = loaded.fixed!
      const moving = loaded.moving!
      // The pair was compatible before; a new scale cannot change that, but
      // the check is cheap and keeps the invariant the app relies on.
      assertCompatiblePair(fixed, moving)

      // Nothing else can replace the inputs while `reloading` is set, but a
      // programmatic load could; a pair the reload did not start from is
      // left alone.
      if (store.state.fixed !== previous.fixed || store.state.moving !== previous.moving) {
        store.update(reloadFailed())
        shell.setStatus({
          message: 'The images changed while reloading, so that reload was discarded.',
          variant: 'warning',
        })
        return
      }

      store.update(budgetApplied(fixed, moving, budgetBytes))
    } catch (error) {
      store.update(reloadFailed())
      shell.setStatus({
        message: `Could not reload the images at ${budget}: ${errorMessage(error)}. The pair loaded at ${formatBytes(previous.fixed.budgetBytes)} is kept.`,
        variant: 'danger',
      })
      return
    }

    shell.setStatus({ message: `Displaying ${loaded.fixed!.name} and ${loaded.moving!.name}…`, busy: true })
    await shell.settled()
    shell.setStatus({
      message: `Reloaded ${loaded.fixed!.name} (fixed) and ${loaded.moving!.name} (moving) at a ${budget} budget. Ready to register.`,
    })
  }

  return { reload }
}
