// Pipeline base URLs must be configured before any itk-wasm module runs.
import './pipelines'

// WebAwesome: base styles, the default theme, and the components the shell
// and splash dialog use. Components register their custom elements on import
// and upgrade the markup already present in index.html.
import '@awesome.me/webawesome/dist/styles/webawesome.css'
import '@awesome.me/webawesome/dist/styles/themes/default.css'
// `wa-visually-hidden-label` keeps the download pickers' labels for
// assistive technology only; the utility is not part of webawesome.css.
import '@awesome.me/webawesome/dist/styles/utilities/visually-hidden.css'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/card/card.js'
import '@awesome.me/webawesome/dist/components/comparison/comparison.js'
import '@awesome.me/webawesome/dist/components/copy-button/copy-button.js'
import '@awesome.me/webawesome/dist/components/details/details.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'
import '@awesome.me/webawesome/dist/components/switch/switch.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import '@awesome.me/webawesome/dist/components/spinner/spinner.js'
import '@awesome.me/webawesome/dist/components/callout/callout.js'
import '@awesome.me/webawesome/dist/components/badge/badge.js'
import '@awesome.me/webawesome/dist/components/divider/divider.js'
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js'

import './style.css'

import type WaButton from '@awesome.me/webawesome/dist/components/button/button.js'

import { downloadBytes } from './io/download'
import { exportRegisteredImage } from './io/export-image'
import { exportRegisteredTransform } from './io/export-transform'
import { loadImageSource } from './io/load-image'
import { budgetBytesFromQuery } from './io/scale-select'
import { registerAffine } from './registration/register'
import { samples } from './samples'
import { createStore, inputsLoaded } from './state'
import { createDownloadFlow } from './ui/download-flow'
import { createImageInfo } from './ui/image-info'
import { createLayout } from './ui/layout'
import { createNotifier, type Notifier } from './ui/notify'
import {
  PERSISTENT_TOAST,
  STARTUP_FAILED_STATUS,
  WEBGL2_UNAVAILABLE_MESSAGE,
  WEBGL2_UNAVAILABLE_STATUS,
} from './ui/notify-options'
import { createRegisterFlow } from './ui/register-flow'
import { createRegistrationPanel } from './ui/registration-panel'
import { createReloadFlow } from './ui/reload-flow'
import { createShell } from './ui/shell'
import { createSplash } from './ui/splash'
import { createThemeToggle } from './ui/theme'
import { createViewControls } from './ui/view-controls'
import { exposeDemoGlobals } from './viewer/panel'
import { webgl2Available } from './viewer/webgl'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app root element')
}

// The notifier comes first, so anything that fails from here on, the
// start-up included, has somewhere to report. Playwright reads it, the
// store, the NiiVue instances the panels publish, and the splash from
// window.__demo.
const notify = createNotifier(app)
exposeDemoGlobals({ notify })

// The inline script in index.html already applied the stored or system
// color scheme before the first paint; the toggle takes over from it.
createThemeToggle(app)

/**
 * Leave the app unusable: `status` on the status line in the danger
 * colour and the Load images button disabled. The persistent toast the
 * caller raises carries the details.
 */
function haltStartup(root: ParentNode, status: string): void {
  const message = root.querySelector<HTMLElement>('#status-message')
  if (message) {
    message.textContent = status
  }
  root.querySelector<HTMLElement>('#status')?.setAttribute('data-variant', 'danger')
  const loadImages = root.querySelector<WaButton>('#load-images')
  if (loadImages) {
    loadImages.disabled = true
  }
}

async function bootstrap(root: HTMLElement, notify: Notifier): Promise<void> {
  // niivue needs a WebGL2 context per panel; without one there is nothing
  // to build, so say so once and stop before the viewers are created.
  if (!webgl2Available()) {
    haltStartup(root, WEBGL2_UNAVAILABLE_STATUS)
    notify.danger(WEBGL2_UNAVAILABLE_MESSAGE, { duration: PERSISTENT_TOAST, dismissible: false })
    return
  }

  // `?budget=<MiB>` on the page URL shrinks the pixel budget so tests and
  // developers can force the ingest pipeline to downsample; the budget
  // picker in the registration panel can change it later. A view that
  // throws while rendering must neither take the other views down with it
  // nor go unnoticed.
  const store = createStore(
    { budgetBytes: budgetBytesFromQuery(window.location.search) },
    { onError: (error) => notify.failure('The display could not be updated', error) },
  )
  exposeDemoGlobals({ state: store })

  // Stack the viewers on a narrow window before niivue sizes its canvases.
  createLayout(root)

  // `splash`, `registration`, `reloads`, and `downloads` are assigned
  // below; the handlers only run once a pair is loaded or on user clicks,
  // long after bootstrap has finished. Every flow catches its own failures
  // and returns the store to idle; the guard reports anything that still
  // escapes.
  const shell = await createShell(root, store, {
    notify,
    onLoadImages: () => splash.open(),
    onRegister: startRegistration,
    onDownload: (kind) => {
      void notify.guard(`The ${kind} download failed`, downloads.download(kind))
    },
  })
  // The "Image details" under each comparison, the view controls above
  // them, and the registration panel follow the store on their own.
  createImageInfo(root, store)
  createViewControls(root, store, shell)
  const registration = createRegisterFlow(store, shell, { register: registerAffine })
  const reloads = createReloadFlow(store, shell, { loadImage: loadImageSource })
  createRegistrationPanel(root, store, {
    onCancel: () => registration.cancel(),
    onBudgetChosen: (budgetBytes) => {
      void notify.guard('The budget reload failed', reloadAndRegister(budgetBytes))
    },
  })
  const downloads = createDownloadFlow(store, shell, {
    exportImage: exportRegisteredImage,
    exportTransform: exportRegisteredTransform,
    download: downloadBytes,
  })

  /** Register the pair in the store; the flow reports the outcome in the status row. */
  function startRegistration(): void {
    void notify.guard('Registration failed', registration.run())
  }

  /** Reload both inputs under `budgetBytes` and register the reloaded pair straight away. */
  async function reloadAndRegister(budgetBytes: number): Promise<void> {
    if (await reloads.reload(budgetBytes)) {
      startRegistration()
    }
  }

  const splash = createSplash(root, {
    store,
    samples,
    // The dialog's status lines are transient, so a warning about an input
    // (a very large image about to be downsampled) is a toast.
    onWarning: (message) => notify.warning(message),
    // The splash has already run `assertCompatiblePair` on the two images.
    // The pair is registered as soon as it is on screen; the dialog closes
    // without waiting for the run.
    async onLoaded(fixed, moving) {
      store.update(inputsLoaded(fixed, moving))
      shell.setStatus({ message: `Displaying ${fixed.name} and ${moving.name}…`, busy: true })
      await shell.settled()
      startRegistration()
    },
  })

  // The Playwright input specs read the splash's pending slots from here.
  exposeDemoGlobals({ splash })

  shell.setStatus({ message: 'Load a fixed and a moving image to begin.' })
  splash.open()
}

void bootstrap(app, notify).catch((error: unknown) => {
  haltStartup(app, STARTUP_FAILED_STATUS)
  // `failure` also logs the error with its stack.
  notify.failure('The demo failed to start', error, { duration: PERSISTENT_TOAST })
})
