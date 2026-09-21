import { defineConfig, devices } from '@playwright/test'

// The Vite dev server `pnpm dev` starts (see package.json). Set
// PLAYWRIGHT_BASE_URL to run the suite against another server instead, for
// example `pnpm preview` or a deployed build; the dev server is then not
// started.
const DEV_SERVER_URL = 'http://localhost:5188'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || DEV_SERVER_URL
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './test',
  // The smoke test loads both images, registers them, and writes two files in
  // one session; registration alone can take minutes on a slow CI runner.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'html' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // `pnpm dev` downloads the sample images before Vite starts, so the
        // first start on a fresh checkout takes longer than usual.
        command: 'pnpm dev',
        url: DEV_SERVER_URL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium has no GPU; SwiftShader provides the WebGL2
        // context niivue renders with.
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
})
