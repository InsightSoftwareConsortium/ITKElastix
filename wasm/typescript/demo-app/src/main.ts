// Pipeline base URLs must be configured before any itk-wasm module runs.
import './pipelines'

// WebAwesome: base styles, the default theme, and the components the shell
// and splash dialog use. Components register their custom elements on import
// and upgrade the markup already present in index.html.
import '@awesome.me/webawesome/dist/styles/webawesome.css'
import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/dialog/dialog.js'
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

import { downloadBytes } from './io/download'
import { exportImage, exportTransform } from './io/export'
import { registerAffine } from './registration/register'
import { samples } from './samples'
import { createStore, inputsLoaded } from './state'
import { createDownloadFlow } from './ui/download-flow'
import { createRegisterFlow } from './ui/register-flow'
import { createShell } from './ui/shell'
import { createSplash } from './ui/splash'
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
    onDownloadImage: () => {
      void downloads.downloadImage()
    },
    onDownloadTransform: () => {
      void downloads.downloadTransform()
    },
  })
  const runRegistration = createRegisterFlow(store, shell, { register: registerAffine })
  const downloads = createDownloadFlow(store, shell, { exportImage, exportTransform, download: downloadBytes })

  const splash = createSplash(root, {
    store,
    samples,
    async onLoaded(fixed, moving) {
      if (fixed.dimension !== moving.dimension) {
        throw new Error(
          `The fixed image is ${fixed.dimension}D but the moving image is ${moving.dimension}D; elastix needs both to match.`,
        )
      }
      store.update(inputsLoaded(fixed, moving))
      shell.setStatus({ message: `Displaying ${fixed.name} and ${moving.name}…`, busy: true })
      await shell.settled()
      shell.setStatus({
        message: `Loaded ${fixed.name} (fixed) and ${moving.name} (moving), ${fixed.dimension}D. Ready to register.`,
      })
    },
  })

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
