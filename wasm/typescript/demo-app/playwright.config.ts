import { defineConfig, devices } from '@playwright/test'

// Where the suite runs, in order of precedence:
//
// - PLAYWRIGHT_WEB_SERVER: a command Playwright starts and waits on before
//   the tests, expected to serve PLAYWRIGHT_BASE_URL (or the dev server URL
//   when that is unset). For example
//   `VITE_BASE_URL=/ITKElastix/ PLAYWRIGHT_BASE_URL=http://localhost:4174/ITKElastix/ PLAYWRIGHT_WEB_SERVER="pnpm preview" pnpm test`
//   runs the suite against a production build under the GitHub Pages
//   sub-path (build with the same VITE_BASE_URL first).
// - PLAYWRIGHT_BASE_URL alone: the tests run against a server that is
//   already up (a deployed build, a preview you started yourself); nothing
//   is started.
// - Neither: the Vite dev server on port 5188 (see vite.config.ts). Locally
//   `pnpm dev` downloads the sample images before Vite starts; in CI (`CI`
//   set) the workflow has already fetched them with --strict, so Vite starts
//   directly and a missing sample is a failed workflow step, not a 404 in a
//   browser test.
//
// The specs navigate relative to the base URL (`page.goto('./')`), so a base
// URL that ends in a sub-path works as well as a bare origin.
const DEV_SERVER_URL = 'http://localhost:5188/'
const isCI = Boolean(process.env.CI)
const baseURL = withTrailingSlash(process.env.PLAYWRIGHT_BASE_URL || DEV_SERVER_URL)
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER || (process.env.PLAYWRIGHT_BASE_URL ? undefined : isCI ? 'pnpm exec vite' : 'pnpm dev')

/** Relative navigation resolves against the last directory of the base URL, so a sub-path must end in a slash. */
function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

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
  webServer: webServerCommand
    ? {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !isCI,
        // `pnpm dev` downloads the sample images before Vite starts, so the
        // first start on a fresh checkout takes longer than usual.
        timeout: 180_000,
      }
    : undefined,
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
