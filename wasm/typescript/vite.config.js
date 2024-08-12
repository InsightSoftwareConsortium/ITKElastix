import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

const base = process.env.VITE_BASE_URL || '/'

export default defineConfig({
  root: path.join('test', 'browser', 'demo-app'),
  base,
  build: {
    outDir: '../../../demo-app',
    emptyOutDir: true,
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['itk-wasm', '@itk-wasm/image-io', '@itk-wasm/mesh-io', '@thewtex/zstddec', '@itk-viewer/io']
  },
  plugins: [
    // put lazy loaded JavaScript and Wasm bundles in dist directory
    viteStaticCopy({
      targets: [
        { src: '../../../dist/pipelines/*', dest: 'pipelines' },
        { src: '../../../node_modules/@itk-wasm/image-io/dist/pipelines/*.{js,wasm,wasm.zst}', dest: 'pipelines' },
        { src: '../../../node_modules/@itk-wasm/mesh-io/dist/pipelines/*.{js,wasm,wasm.zst}', dest: 'pipelines' },
      ],
    })
  ],
})
