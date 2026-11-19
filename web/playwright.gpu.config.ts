import { defineConfig, devices } from "@playwright/test";

/**
 * A harness with the machine's actual GPU.
 *
 * Playwright's bundled Chromium falls back to SwiftShader, which rasterises
 * every frame on the CPU. That is fine for assertions about behaviour and
 * useless for assertions about smoothness: the Final Draw measures in the
 * twenties under SwiftShader and a flat 60 on the same machine's real GPU, so
 * the default harness will happily report a scene as broken when nobody will
 * ever see it that way.
 *
 * This config exists to get a number that means something. It runs headed,
 * because the GPU process is not available to the headless shell.
 *
 *     npx playwright test e2e/final-draw-perf.spec.ts --config=playwright.gpu.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // One at a time. A frame rate measured while other browsers compete for the
  // same CPU is not a measurement of the scene under test.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: {
      headless: false,
      args: [
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--use-angle=d3d11",
      ],
    },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
