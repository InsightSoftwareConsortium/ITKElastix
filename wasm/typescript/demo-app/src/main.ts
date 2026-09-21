// Pipeline base URLs must be configured before any itk-wasm module runs.
import './pipelines'
import './style.css'

import { createViewerPanel } from './viewer/panel'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app root element')
}

// Placeholder until the WebAwesome application shell and splash dialog land.
app.innerHTML = `
  <main class="placeholder">
    <header class="placeholder-header">
      <h1>elastix affine registration</h1>
      <p data-status>Loading…</p>
    </header>
    <div class="placeholder-panels">
      <section class="viewer-panel" data-panel="fixed"><span class="viewer-caption">Fixed</span></section>
      <section class="viewer-panel" data-panel="moving"><span class="viewer-caption">Moving</span></section>
    </div>
  </main>
`

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = app!.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing ${selector}`)
  }
  return element
}

async function bootstrap(): Promise<void> {
  const status = requireElement<HTMLParagraphElement>('[data-status]')
  try {
    await createViewerPanel(requireElement('[data-panel="fixed"]'), 'Fixed', { role: 'fixed' })
    await createViewerPanel(requireElement('[data-panel="moving"]'), 'Moving', { role: 'moving' })
    status.textContent = 'Viewer ready'
  } catch (error) {
    status.textContent = `Viewer failed to start: ${error instanceof Error ? error.message : String(error)}`
    throw error
  }
}

void bootstrap()
