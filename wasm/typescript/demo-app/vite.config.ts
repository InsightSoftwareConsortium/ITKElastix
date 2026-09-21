import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// ITK-Wasm packages whose lazily loaded pipeline modules (.js/.wasm/.wasm.zst)
// are vendored into dist/pipelines/ so the demo is fully self-hosted.
// src/pipelines.ts points each package at that directory at runtime.
const itkWasmPipelinePackages = ['elastix', 'image-io', 'transform-io', 'downsample']

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
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
