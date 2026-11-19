import { expect, test } from "@playwright/test";

/**
 * What the boutique costs.
 *
 * Two things worth measuring, and they are different questions.
 *
 * The first is whether it is smooth while the camera is moving, which is the
 * only time this scene does any work. Read the renderer before reading that
 * number: Playwright's bundled Chromium falls back to SwiftShader and
 * rasterises every frame on the CPU, where any real 3D scene measures badly and
 * says nothing about what a person sees. `playwright.gpu.config.ts` runs the
 * same spec on the machine's actual GPU.
 *
 * The second is whether it costs anything when nothing is happening. The scene
 * is static joinery and renders on demand, so an idle boutique should issue no
 * draw calls at all — and that is a claim worth checking rather than asserting,
 * because "renders on demand" is easy to write and easy to get wrong.
 */

const SOFTWARE_FLOOR = 3;
const GPU_FLOOR = 30;

test("the environment is cheap to look at and smooth to move through", async ({ page }, info) => {
  test.setTimeout(180_000);
  test.skip(
    info.config.workers > 1,
    `frame rate is not measurable with ${info.config.workers} workers competing — run with --workers=1`,
  );

  // Count draw calls at the source, before anything on the page runs.
  await page.addInitScript(() => {
    const host = window as unknown as { __draws: number };
    host.__draws = 0;
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ["drawElements", "drawArrays", "drawElementsInstanced"] as const) {
        const original = (proto as unknown as Record<string, unknown>)[name];
        if (typeof original !== "function") continue;
        (proto as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
          host.__draws += 1;
          return (original as (...a: unknown[]) => unknown).apply(this, args);
        };
      }
    }
  });

  await page.goto("/boutique-studio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(4000);

  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !debug) return "unknown";
    return String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "unknown");
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);

  const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);

  // Idle: the camera has settled and nothing is being pointed at.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1200);
  const before = await draws();
  await page.waitForTimeout(2500);
  const idle = (await draws()) - before;

  // Moving: the camera is crossing the room.
  await page.getByRole("button", { name: "Focus recommended" }).click();
  const movingStart = await draws();
  const t0 = Date.now();
  await page.waitForTimeout(2000);
  const moving = (await draws()) - movingStart;
  const seconds = (Date.now() - t0) / 1000;

  // Draw calls are not frames. Each frame renders the scene twice — once into
  // the shadow map and once for real — so a frame costs roughly two calls per
  // mesh. Dividing by one pass would have reported double the truth, which is
  // the sort of flattering arithmetic a performance number should never do.
  const meshes = 68;
  const passes = 2;
  const fps = +(moving / (meshes * passes) / seconds).toFixed(1);
  const floor = software ? SOFTWARE_FLOOR : GPU_FLOOR;

  info.annotations.push({
    type: "perf",
    description: JSON.stringify({ idleDraws: idle, movingDraws: moving, fps, software, renderer }),
  });
  console.log(
    `boutique: ${idle} draw calls idle over 2.5 s; ~${fps} fps moving (estimated) — ${
      software ? "software" : "GPU"
    } (${renderer})`,
  );

  // Idle must be genuinely idle. A handful of calls can slip through from a
  // trailing frame; hundreds would mean the scene is drawing continuously.
  expect(idle, `${idle} draw calls while idle: the scene is not rendering on demand`).toBeLessThan(
    meshes * 3,
  );
  expect(moving, "the scene drew nothing while the camera moved").toBeGreaterThan(meshes * 5);
  expect(fps, `${fps} fps while moving on ${renderer}`).toBeGreaterThan(floor);
});
