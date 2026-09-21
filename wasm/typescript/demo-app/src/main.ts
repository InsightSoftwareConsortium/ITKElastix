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
import '@awesome.me/webawesome/dist/components/copy-button/copy-button.js'
import '@awesome.me/webawesome/dist/components/details/details.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import '@awesome.me/webawesome/dist/components/split-panel/split-panel.js'
import '@awesome.me/webawesome/dist/components/switch/switch.js'
import '@awesome.me/webawesome/dist/components/slider/slider.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js'
import '@awesome.me/webawesome/dist/components/spinner/spinner.js'
import '@awesome.me/webawesome/dist/components/callout/callout.js'
import '@awesome.me/webawesome/dist/components/badge/badge.js'
import '@awesome.me/webawesome/dist/components/divider/divider.js'
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js'

import './style.css'

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
import { createRegisterFlow } from './ui/register-flow'
import { createRegistrationPanel } from './ui/registration-panel'
import { createReloadFlow } from './ui/reload-flow'
import { createShell } from './ui/shell'
import { createSplash } from './ui/splash'
import { createThemeToggle } from './ui/theme'
import { createViewControls } from './ui/view-controls'
import { createOverlay } from './viewer/overlay'
import { exposeDemoGlobals } from './viewer/panel'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app root element')
}

// The inline script in index.html already applied the stored or system
// color scheme before the first paint; the toggle takes over from it.
createThemeToggle(app)

async function bootstrap(root: HTMLElement): Promise<void> {
  // `?budget=<MiB>` on the page URL shrinks the pixel budget so tests and
  // developers can force the ingest pipeline to downsample; the budget
  // picker in the registration panel can change it later.
  const store = createStore({ budgetBytes: budgetBytesFromQuery(window.location.search) })
  // Playwright reads the store (and the two NiiVue instances the panels
  // publish) from window.__demo.
  exposeDemoGlobals({ state: store })

  // Stack the viewers on a narrow window before niivue sizes its canvases.
  createLayout(root)

  // `splash`, `registration`, and `downloads` are assigned below; the
  // handlers only run on user clicks, long after bootstrap has finished.
  const shell = await createShell(root, store, {
    onLoadImages: () => splash.open(),
    onRegister: () => {
      void registration.run()
    },
    onDownload: (kind) => {
      void downloads.download(kind)
    },
  })
  // The "Image details" under each viewer, the view controls above them,
  // the overlay on the fixed panel, and the registration panel follow the
  // store on their own.
  createImageInfo(root, store)
  createViewControls(root, store, shell)
  createOverlay(root, store, shell)
  const registration = createRegisterFlow(store, shell, { register: registerAffine })
  const reloads = createReloadFlow(store, shell, { loadImage: loadImageSource })
  createRegistrationPanel(root, store, {
    onCancel: () => registration.cancel(),
    onBudgetChosen: (budgetBytes) => {
      void reloads.reload(budgetBytes)
    },
  })
  const downloads = createDownloadFlow(store, shell, {
    exportImage: exportRegisteredImage,
    exportTransform: exportRegisteredTransform,
    download: downloadBytes,
  })

  const splash = createSplash(root, {
    store,
    samples,
    // The splash has already run `assertCompatiblePair` on the two images.
    async onLoaded(fixed, moving) {
      store.update(inputsLoaded(fixed, moving))
      shell.setStatus({ message: `Displaying ${fixed.name} and ${moving.name}…`, busy: true })
      await shell.settled()
      shell.setStatus({
        message: `Loaded ${fixed.name} (fixed) and ${moving.name} (moving), ${fixed.dimension}D. Ready to register.`,
      })
    },
  })

  // The Playwright input specs read the splash's pending slots from here.
  exposeDemoGlobals({ splash })

  shell.setStatus({ message: 'Load a fixed and a moving image to begin.' })
  splash.open()
}

void bootstrap(app).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const status = document.querySelector<HTMLElement>('#status-message')
  if (status) {
    status.textContent = `The demo failed to start: ${message}`
  }
  console.error(error)
})
