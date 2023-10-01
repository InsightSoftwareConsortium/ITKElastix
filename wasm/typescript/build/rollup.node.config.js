import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import packageJson from '../package.json' assert { type: 'json' }
import path from 'path'

const bundleName = path.basename(packageJson.name)

export default {
  input: './src/index-node.ts',
  output: [
    {
      file: `./dist/bundles/${bundleName}-node.js`,
      format: 'es',
      sourcemap: true,
      // plugins: [terser(),],
    },
  ],
  plugins: [
    commonjs({
      transformMixedEsModules: true
    }),
    nodeResolve({
      preferBuiltins: true,
      browser: false,
    }),
    typescript(),
    json(),
  ],
}
