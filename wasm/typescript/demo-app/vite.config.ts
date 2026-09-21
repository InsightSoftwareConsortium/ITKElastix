import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// ITK-Wasm packages whose lazily loaded pipeline modules (.js/.wasm/.wasm.zst)
// are vendored into dist/pipelines/ so the demo is fully self-hosted.
// src/pipelines.ts points each package at that directory at runtime.
const itkWasmPipelinePackages = ['elastix', 'image-io', 'transform-io', 'downsample']

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  // The demo has no client-side routes, so the SPA history fallback is off:
  // with it, the dev and preview servers answer every missing path (a zarr
  // store's absent `.zmetadata`, an out-of-range chunk key, a mistyped
  // `.ozx` URL) with index.html and status 200, and the OME-Zarr readers
  // choke on HTML where a static host would have returned 404. `/` still
  // serves index.html.
  appType: 'mpa',
  server: {
    port: 5188,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Packages that spawn workers or load wasm relative to their own module URL
    // must not be pre-bundled by esbuild, or those relative lookups break.
    exclude: [
      'itk-wasm',
      '@itk-wasm/elastix',
      '@itk-wasm/image-io',
      '@itk-wasm/transform-io',
      '@itk-wasm/downsample',
      '@thewtex/zstddec',
      '@fideus-labs/ngff-zarr',
      '@fideus-labs/fiff',
      // fiff imports geotiff from node_modules; the app's own import (the
      // SubIFD shim in src/io/tiff-store.ts) must resolve to that same copy.
      'geotiff',
      '@awesome.me/webawesome',
    ],
    include: ['@fideus-labs/worker-pool'],
  },
  build: {
    outDir: 'dist',
  },
  plugins: [
    viteStaticCopy({
      targets: itkWasmPipelinePackages.map((pkg) => ({
        src: `node_modules/@itk-wasm/${pkg}/dist/pipelines/*.{js,wasm,wasm.zst}`,
        dest: 'pipelines/',
        // v4 preserves the source directory structure by default; strip the
        // node_modules/... base so files land directly in dist/pipelines/.
        rename: { stripBase: true },
      })),
    }),
  ],
})
