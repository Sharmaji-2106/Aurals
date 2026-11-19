import { expect, test, type Page } from "@playwright/test";

/**
 * Capture the sequence at each beat, for looking at.
 *
 * Not an assertion suite — a camera. The scene is a pure function of its clock,
 * so parking it at an instant renders exactly what plays at that instant, and
 * the only way to judge a composition is to look at it.
 *
 *   CAPTURE=1 npx playwright test e2e/final-draw-capture.spec.ts
 *
 * Writes to test-results/final-draw/.
 *
 * It is opt-in because it is a tool rather than a test: it asserts almost
 * nothing, and running thirteen screenshots per tier alongside the real suite
 * takes workers away from tests that do.
 */

const SHOTS = "test-results/final-draw";

async function seek(page: Page, seconds: number) {
  await page.evaluate((s) => {
    (window as unknown as { __finalDrawSeek?: (n: number) => void }).__finalDrawSeek?.(s);
  }, seconds);
  // One frame to apply, plus a little slack for the transform to land.
  await page.waitForTimeout(220);
}

test("capture every beat", async ({ page, isMobile }, info) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to write frames");
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/final-draw-studio");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __finalDrawSeek?: unknown }).__finalDrawSeek === "function",
  );

  const tier = isMobile ? "mobile" : "desktop";

  // Across every stage, plus the moments between them that actually carry the
  // motion — the middle of the riffle matters more than its boundaries.
  const beats: [string, number][] = [
    ["01-empty", 0.2],
    ["02-entering", 1.1],
    ["03-decks-settled", 2.0],
    ["04-converging", 2.7],
    ["05-riffle-early", 3.9],
    ["06-riffle-mid", 5.2],
    ["07-riffle-late", 6.5],
    ["08-unified", 7.3],
    ["09-drawing", 8.5],
    ["10-flip-begin", 9.4],
    ["11-flip-mid", 9.9],
    ["12-revealed", 10.9],
    ["13-hold", 12.5],
  ];

  for (const [name, at] of beats) {
    await seek(page, at);
    await page.screenshot({ path: `${SHOTS}/${tier}-${name}.png` });
  }

  const probe = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cards: document.querySelectorAll("[data-fd-card]").length,
  }));
  info.annotations.push({
    type: "capture",
    description: JSON.stringify({ tier, ...probe, consoleErrors: errors.slice(0, 8) }),
  });

  expect(probe.overflowX, "the composition must not overflow horizontally").toBe(false);
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
