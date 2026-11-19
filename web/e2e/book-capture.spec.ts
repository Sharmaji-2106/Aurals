import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Review captures of the edition, on the real GPU.
 *
 *     BOOK_CAPTURE=1 npx playwright test e2e/book-capture.spec.ts --config=playwright.gpu.config.ts
 *
 * Parks the clock at named moments and screenshots each, then plays the whole
 * thing in real time with video recording on. Writes to `design/book/review/`
 * (or `BOOK_CAPTURE_DIR`). Skipped unless asked for: it is a tool for looking,
 * not a test.
 */

const OUT = process.env.BOOK_CAPTURE_DIR ?? path.resolve(__dirname, "../../design/book/review");
const MOMENTS: [string, number][] = (
  process.env.BOOK_MOMENTS ??
  "01-closed-book:0.6,02-cover-opening:2.55,03-mid-page-turn:4.62,04-editorial-spread:3.95,05-final-spread:8.2,06-product-zoom:9.9,07-theme-transformation:10.5,08-product-card:12.3,09-sound-dna:14"
)
  .split(",")
  .map((pair) => {
    const [name, t] = pair.split(":");
    return [name, Number(t)];
  });

test.skip(!process.env.BOOK_CAPTURE, "review captures run on request");

test.describe("edition captures", () => {
  test("moments", async ({ page }) => {
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    const width = Number(process.env.BOOK_W ?? 1440);
    const height = Number(process.env.BOOK_H ?? 900);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/book-studio");
    await expect(page.locator("[data-edition][data-mode='film']")).toBeVisible({ timeout: 60_000 });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl?.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    console.log("renderer:", renderer);
    for (const [name, t] of MOMENTS) {
      await page.evaluate((s) => (window as unknown as { __bookSeek: (s: number) => void }).__bookSeek(s), t);
      await page.waitForTimeout(t > 8.2 ? 700 : 450);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    }
    console.log("console errors:", errors.length ? errors.join("\n") : "none");
  });
});

test.describe("edition recording", () => {
  test("the whole film, in real time", async ({ browser }) => {
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    const width = Number(process.env.BOOK_W ?? 1440);
    const height = Number(process.env.BOOK_H ?? 900);
    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: OUT, size: { width, height } },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/book-studio");
    const edition = page.locator("[data-edition]");
    await expect(edition).toHaveAttribute("data-landed", "true", { timeout: 120_000 });
    // A moment on the page it lands on, then a little of it scrolled by hand.
    await page.waitForTimeout(1500);
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(1200);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(OUT, "aurals-edition-full.webm"));
    if (video) await video.delete();
    console.log("console errors:", errors.length ? errors.join("\n") : "none");
  });
});
