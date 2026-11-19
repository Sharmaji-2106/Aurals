import { expect, test } from "@playwright/test";

/**
 * What the book costs, and whether it leaks.
 *
 * Read the renderer before reading the number. Playwright's bundled Chromium
 * falls back to SwiftShader, which rasterises every frame on the CPU; a 3D
 * scene with shadows measures there in single figures and at 60 on the same
 * machine's GPU. So the floor depends on what drew the frames, and the honest
 * GPU number comes from the GPU harness:
 *
 *     npx playwright test e2e/book-perf.spec.ts --config=playwright.gpu.config.ts
 */

const GPU_FLOOR = 50;
const SOFTWARE_FLOOR = 4;

type Renderer = { calls: number; triangles: number; textures: number; geometries: number };

test("the page turns hold frame rate, and replays do not accumulate GPU memory", async ({ page }, info) => {
  test.setTimeout(180_000);
  test.skip(info.project.name === "mobile", "measured once, on the desktop project");
  test.skip(
    info.config.workers > 1,
    `frame rate is not measurable with ${info.config.workers} workers competing — run with --workers=1`,
  );

  await page.goto("/book-studio");
  const main = page.locator("[data-edition]");
  await expect(main).toHaveAttribute("data-mode", "film", { timeout: 90_000 });

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);

  // Measure the busiest stretch: leaves deforming, overlapping, casting
  // shadows, through the riffle.
  await expect
    .poll(async () => Number(await main.getAttribute("data-time")), { timeout: 60_000 })
    .toBeGreaterThan(3.2);
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
  const during = await page.evaluate(() =>
    (window as unknown as { __bookRenderer: () => Renderer }).__bookRenderer(),
  );

  // Replay three times; GPU resources must not grow.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Controls" }).click();
  const counts: Renderer[] = [];
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Replay" }).click();
    await expect.poll(async () => Number(await main.getAttribute("data-time"))).toBeLessThan(5);
    await page.keyboard.press("Escape");
    await expect(main).toHaveAttribute("data-time", "16.550");
    counts.push(
      await page.evaluate(() => (window as unknown as { __bookRenderer: () => Renderer }).__bookRenderer()),
    );
  }

  // The ending: the real page under a moving camera (a scaled DOM tree), from
  // the change of light through the pullback.
  await page.getByRole("button", { name: "Replay" }).click();
  await expect
    .poll(async () => Number(await main.getAttribute("data-time")), { timeout: 60_000 })
    .toBeGreaterThan(9.9);
  const ending = await page.evaluate(
    () =>
      new Promise<{ fps: number; worst: number }>((resolve) => {
        let frames = 0;
        let worst = 0;
        let last = performance.now();
        const started = last;
        const tick = (now: number) => {
          frames += 1;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - started < 2300) requestAnimationFrame(tick);
          else resolve({ fps: +(frames / ((now - started) / 1000)).toFixed(1), worst: +worst.toFixed(1) });
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(`book ending: ${ending.fps} FPS, worst frame ${ending.worst} ms`);

  // The Sound Card: the engraving under bloom, over a reflecting floor, then
  // the light changing and the card rising.
  const measure = () =>
    page.evaluate(
      () =>
        new Promise<{ fps: number; worst: number }>((resolve) => {
          let frames = 0;
          let worst = 0;
          let last = performance.now();
          const started = last;
          const tick = (now: number) => {
            frames += 1;
            worst = Math.max(worst, now - last);
            last = now;
            if (now - started < 2300) requestAnimationFrame(tick);
            else resolve({ fps: +(frames / ((now - started) / 1000)).toFixed(1), worst: +worst.toFixed(1) });
          };
          requestAnimationFrame(tick);
        }),
    );
  await expect
    .poll(async () => Number(await main.getAttribute("data-time")), { timeout: 60_000 })
    .toBeGreaterThan(18);
  const engraving = await measure();
  await expect
    .poll(async () => Number(await main.getAttribute("data-time")), { timeout: 60_000 })
    .toBeGreaterThan(25.5);
  const rising = await measure();
  console.log(
    `sound card: engraving ${engraving.fps} FPS (worst ${engraving.worst} ms), light and rise ${rising.fps} FPS (worst ${rising.worst} ms)`,
  );

  const floor = software ? SOFTWARE_FLOOR : GPU_FLOOR;
  info.annotations.push({
    type: "perf",
    description: JSON.stringify({ fps, renderer, software, during, counts }),
  });
  console.log(
    `book: ${fps} FPS through the page turns on ${software ? "software" : "GPU"} (${renderer}); ` +
      `${during.calls} draw calls, ${during.triangles} triangles; ` +
      `textures across replays ${counts.map((c) => c.textures).join(" → ")}`,
  );

  expect(fps, `${fps} FPS on ${renderer}`).toBeGreaterThan(floor);
  expect(new Set(counts.map((c) => c.textures)).size, "textures grew across replays").toBe(1);
  expect(new Set(counts.map((c) => c.geometries)).size, "geometries grew across replays").toBe(1);
  // A few dozen meshes, drawn twice (shadow pass and colour pass).
  expect(during.calls).toBeLessThan(120);
});
