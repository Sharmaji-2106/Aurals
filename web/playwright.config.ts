import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running stack (`python scripts/dev.py up`).
 * They exercise the web app and API but never contact YouTube.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  /**
   * Capped, because the suite shares two things it cannot parallelise away: one
   * API process, and the CPU that rasterises WebGL when no GPU is available.
   *
   * Unbounded workers used to be fine and stopped being fine when the suite
   * grew a second full onboarding-to-results journey and a 3D environment.
   * Past three workers, journey tests start timing out — not because they are
   * wrong, but because they are queueing behind each other inside one uvicorn.
   * Three is measured, not guessed: four fails, three does not.
   */
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
