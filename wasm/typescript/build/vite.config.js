import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

export default defineConfig({
  root: path.join('test', 'browser', 'demo-app'),
  build: {
    outDir: '../../../demo-app',
    emptyOutDir: true,
  },
  plugins: [
    // put lazy loaded JavaScript and Wasm bundles in dist directory
    viteStaticCopy({
      targets: [
        { src: '../../../dist/pipelines/*', dest: 'pipelines' },
        { src: '../../../dist/web-workers/*', dest: 'web-workers' },
      ],
    })
  ],
})
