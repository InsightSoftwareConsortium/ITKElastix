// Pipeline base URLs must be configured before any itk-wasm module runs.
import './pipelines'
import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app root element')
}

// Placeholder until the application shell and splash dialog land.
app.innerHTML = `
  <main class="placeholder">
    <h1>elastix affine registration</h1>
    <p>Loading…</p>
  </main>
`
