import { defineConfig, devices } from '@playwright/test'
import { execFileSync } from 'child_process'

/**
 * Post-deploy smoke configuration — runs against the LIVE deployed site.
 *
 * Deliberately separate from `playwright.config.ts`: that one builds and
 * serves `out/` locally, which is the wrong subject here. A post-deploy check
 * exists to catch what only the real deployment can go wrong at — a basePath
 * the build never sees, an asset Pages does not serve, a route the exporter
 * wrote but the host does not resolve. Pointing these specs at a local server
 * would make them pass in exactly the cases they exist to catch.
 *
 * `SMOKE_BASE_URL` is supplied by `.github/workflows/post-deploy-smoke.yml`.
 * The fallback is the repository's default Pages URL, so the suite is
 * runnable by hand without exporting anything.
 */
const BASE =
  process.env.SMOKE_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'https://freeforcharity.github.io/FFC-EX-newheightseducation.org/'

function systemChromium(): string | undefined {
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execFileSync('which', [name], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim()
      if (p) return p
    } catch {
      // try the next one
    }
  }
  return undefined
}

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A live site can be briefly slow right after a deploy; one retry absorbs
  // that without hiding a genuine failure, which would fail both attempts.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  // No webServer: the whole point is that the subject is already deployed.
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    // Generous: this crosses the public internet, not localhost.
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  timeout: 60_000,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: systemChromium() } },
    },
  ],
})
