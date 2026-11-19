import { expect, test } from "@playwright/test";

/**
 * What the rail costs.
 *
 * Nine cards, each a handful of divs, moved by one transform string per frame.
 * There is no renderer, no canvas and no layout work in the loop, which is the
 * whole reason a sequence this cinematic is cheap — so the number to watch is
 * not really the frame rate but whether anything has crept into the frame that
 * forces layout or paint.
 *
 * Read the renderer before reading the number. Playwright's bundled Chromium
 * falls back to SwiftShader and rasterises on the CPU; this scene survives that
 * far better than a 3D one, but the thresholds still differ.
 */

const SOFTWARE_FLOOR = 30;
const GPU_FLOOR = 50;

test("the sequence holds a usable frame rate", async ({ page }, info) => {
  test.setTimeout(120_000);
  test.skip(
    info.config.workers > 1,
    `frame rate is not measurable with ${info.config.workers} workers competing — run with --workers=1`,
  );

  await page.goto("/selection-studio");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __railSeek?: unknown }).__railSeek === "function",
  );

  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !debug) return "unknown";
    return String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "unknown");
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);

  // Measure through the middle of the travel, where every card is moving and
  // the most of them are on screen at once.
  await page.evaluate(() => {
    (window as unknown as { __railSeek?: (n: number) => void }).__railSeek?.(2.6);
  });
  await page.getByRole("button", { name: /^Controls$/i }).click();
  await page.getByRole("button", { name: /^(Play|Resume)$/ }).click();
  await page.waitForTimeout(700);

  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const started = performance.now();
        const tick = () => {
          frames += 1;
          const elapsed = performance.now() - started;
          if (elapsed < 2500) requestAnimationFrame(tick);
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
  console.log(`selection rail ${fps} FPS over ${nodes} elements — ${software ? "software" : "GPU"}`);

  expect(fps, `${fps} FPS on ${renderer}`).toBeGreaterThan(floor);
  // A rail that has grown hundreds of nodes has stopped being nine cards.
  expect(nodes, `${nodes} elements`).toBeLessThan(220);
});
