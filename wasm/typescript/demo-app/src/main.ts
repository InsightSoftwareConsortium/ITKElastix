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
import { budgetBytesFromQuery } from './io/scale-select'
import { registerAffine } from './registration/register'
import { samples } from './samples'
import { createStore, inputsLoaded } from './state'
import { createDownloadFlow } from './ui/download-flow'
import { createImageInfo } from './ui/image-info'
import { createRegisterFlow } from './ui/register-flow'
import { createShell } from './ui/shell'
import { createSplash } from './ui/splash'
import { createViewControls } from './ui/view-controls'
import { createOverlay } from './viewer/overlay'
import { exposeDemoGlobals } from './viewer/panel'

// Follow the browser/OS color scheme; WebAwesome's dark palette is keyed on
// the `wa-dark` class of the root element.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
function applyColorScheme(prefersDark: boolean): void {
  document.documentElement.classList.toggle('wa-dark', prefersDark)
}
applyColorScheme(darkQuery.matches)
darkQuery.addEventListener('change', (event) => applyColorScheme(event.matches))

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app root element')
}

async function bootstrap(root: HTMLElement): Promise<void> {
  const store = createStore()
  // Playwright reads the store (and the two NiiVue instances the panels
  // publish) from window.__demo.
  exposeDemoGlobals({ state: store })

  // `splash`, `runRegistration`, and `downloads` are assigned below; the
  // handlers only run on user clicks, long after bootstrap has finished.
  const shell = await createShell(root, store, {
    onLoadImages: () => splash.open(),
    onRegister: () => {
      void runRegistration()
    },
    onDownload: (kind) => {
      void downloads.download(kind)
    },
  })
  // The "Image details" under each viewer, the view controls above them,
  // and the overlay on the fixed panel follow the store on their own.
  createImageInfo(root, store)
  createViewControls(root, store, shell)
  createOverlay(root, store, shell)
  const runRegistration = createRegisterFlow(store, shell, { register: registerAffine })
  const downloads = createDownloadFlow(store, shell, {
    exportImage: exportRegisteredImage,
    exportTransform: exportRegisteredTransform,
    download: downloadBytes,
  })

  // `?budget=<MiB>` on the page URL shrinks the pixel budget so tests and
  // developers can force the ingest pipeline to downsample.
  const budgetBytes = budgetBytesFromQuery(window.location.search)

  const splash = createSplash(root, {
    store,
    samples,
    budgetBytes,
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
