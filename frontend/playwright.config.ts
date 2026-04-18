import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runner.
 *
 * Two modes are supported:
 *   1. Local dev: `npm run test:e2e` — assumes a dev server at :5173 that the
 *      runner will boot via `webServer` unless one is already up.
 *   2. Fixture mode: when `E2E_FIXTURE=1`, the tests bypass Firebase entirely
 *      by mounting a lightweight fixture app at /e2e. This lets CI run E2E
 *      without any network egress to Firebase/Cloud Run.
 *
 * Google-auth and camera-dependent paths are NOT exercised here — those are
 * covered by unit + manual smoke. E2E guards the user-facing workflows that
 * survive any real regression: seeding, manual ID check-in, concierge chat.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_E2E: "1",
    },
  },
});
