import { expect, test } from "@playwright/test";

/**
 * The frame budget.
 *
 * The concept this replaced was measured at 1.9 FPS the first time it looked
 * good, which is not a scene but a slideshow. That failure is most of the
 * reason this one is built from DOM elements and compositor transforms rather
 * than from a renderer: there is no render target, no shadow map and no
 * per-frame texture here.
 *
 * ## Read the renderer before reading the number
 *
 * Playwright's bundled Chromium falls back to SwiftShader — software
 * rasterisation on the CPU — and under it this scene measures in the twenties
 * while measuring a flat 60 on the same machine's actual GPU. Chasing the
 * software number is chasing a phantom: it says almost nothing about what a
 * person sees, and it rewards changes that help a CPU rasteriser over changes
 * that help a compositor.
 *
 * So the threshold depends on what is actually doing the work. The software
 * floor is set low deliberately — it is there to catch a collapse, not to
 * certify smoothness — and the GPU threshold is the one that means something.
 *
 * To measure representatively:
 *
 *     npx playwright test e2e/final-draw-perf.spec.ts --config=playwright.gpu.config.ts
 */

const SOFTWARE_FLOOR = 20;
const GPU_FLOOR = 50;

test("the sequence holds a usable frame rate", async ({ page }, info) => {
  test.setTimeout(120_000);

  // A frame rate measured while other browsers are competing for the same CPU
  // is not a measurement of this scene. Rather than report a number that means
  // nothing, say so and stop.
  test.skip(
    info.config.workers > 1,
    `frame rate is not measurable with ${info.config.workers} workers competing — run with --workers=1`,
  );

  await page.goto("/final-draw-studio");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });

  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "unknown";
    const debug = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
    if (!debug) return "unknown";
    return String((gl as WebGLRenderingContext).getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "unknown");
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);

  // Measure during the riffle, which is when the most things are moving at
  // once: both decks, the growing stack, and cards in flight between them.
  await page.evaluate(() => {
    (window as unknown as { __finalDrawSeek?: (n: number) => void }).__finalDrawSeek?.(3.4);
  });
  await page
    .locator("main")
    .getByRole("button", { name: /play|resume/i })
    .first()
    .click();
  // Let the first frames and any style recalculation settle.
  await page.waitForTimeout(900);

  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const started = performance.now();
        const tick = () => {
          frames += 1;
          const elapsed = performance.now() - started;
          if (elapsed < 3000) requestAnimationFrame(tick);
          else resolve(+(frames / (elapsed / 1000)).toFixed(1));
        };
        requestAnimationFrame(tick);
      }),
  );

  const nodes = await page.evaluate(() => document.querySelectorAll("main div").length);
  const floor = software ? SOFTWARE_FLOOR : GPU_FLOOR;

  info.annotations.push({
    type: "perf",
    description: JSON.stringify({ fps, nodes, software, renderer, floor }),
  });
  console.log(
    `final-draw ${fps} FPS over ${nodes} elements — ${software ? "software" : "GPU"} (${renderer})`,
  );

  expect(
    fps,
    software
      ? `${fps} FPS under software rasterisation, below the ${floor} FPS collapse floor. ` +
          `This threshold only catches catastrophes; measure with playwright.gpu.config.ts for a real number.`
      : `${fps} FPS on ${renderer} is too slow to be watched`,
  ).toBeGreaterThan(floor);
});
