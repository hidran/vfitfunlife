import { defineConfig, devices } from '@playwright/test';

/**
 * The end-to-end journey suite, run against the Firebase emulator suite.
 *
 * Separate from `playwright.config.ts` on purpose. That config points at `npm run dev`,
 * which loads `.env.local` — the *staging* project. These specs register accounts, approve
 * providers and create bookings, so they must not touch a shared backend; and the emulator
 * is the only place phone registration can be driven, since the Auth emulator hands back the
 * SMS code it would have sent.
 *
 * Run it with:
 *   npm run e2e:journey
 *
 * `reuseExistingServer` means an emulator suite and dev server you already have running are
 * reused; otherwise Playwright starts them. The functions emulator takes a while to load ~100
 * function definitions, hence the generous timeouts.
 *
 * Serial, single worker: the journey is one continuous story in which the provider, the
 * superadmin and the customer act in turn on shared backend state. Parallelism would let
 * later steps run before the state they depend on exists.
 */
export default defineConfig({
  testDir: './e2e/journey',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app is mobile-first; the journey is the phone experience.
    ...devices['Pixel 5'],
  },

  projects: [{ name: 'journey' }],

  webServer: [
    {
      command: 'npm run emulators',
      url: 'http://localhost:4000',
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // dev:e2e loads .env.e2e, whose project id matches the emulators'. Using the ordinary
      // dev script here would point the browser at the staging project id, and every callable
      // would 404 against the functions emulator.
      command: 'npm run dev:e2e',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
