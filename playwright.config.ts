import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real app, in a real browser, driven the way Tejas and
 * a parent use it.
 *
 * The unit suite proves the services compute the right numbers against a fake
 * IndexedDB. It cannot see a button inside a form that submits it, a dialog
 * trapped inside a card, a hook that tears the app down on the second render,
 * or a lesson row that wraps its label to "Hist…" - every one of which has
 * shipped. Those only exist once React, Tailwind and a browser are all in the
 * room, which is what this suite is for.
 *
 * Runs against the Vite dev server rather than the built bundle, because the
 * specs read the database through the app's own module (`e2e/fixtures.ts`)
 * to assert what was written, not only what was drawn.
 *
 * Two projects, because the app has two layouts: a bottom bar and a More sheet
 * below 768px, a top bar above it. Phone first - that is where it is used.
 */
export default defineConfig({
  testDir: './e2e',
  // Exploration lives beside the suite but is never part of it.
  testIgnore: '**/explore/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000/T2026GCSGenie/',
    // Dates are local-date strings everywhere in the app, so the zone is fixed
    // or a run on a CI box in UTC and one on a laptop in London disagree.
    timezoneId: 'Europe/London',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/T2026GCSGenie/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
