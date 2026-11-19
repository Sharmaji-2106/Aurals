import { expect, test, type Page } from "@playwright/test";

/**
 * Capture the rail at each beat, for looking at.
 *
 * A camera, not an assertion suite. Whether a composition looks expensive is a
 * question for the eye, and this brief makes the visual standard the acceptance
 * criterion — so the frames are the deliverable this file produces.
 *
 *   CAPTURE=1 npx playwright test e2e/selection-capture.spec.ts
 *
 * Writes to test-results/selection/. Opt-in, because it is a tool.
 */

const SHOTS = "test-results/selection";

async function seek(page: Page, seconds: number) {
  await page.evaluate((s) => {
    (window as unknown as { __railSeek?: (n: number) => void }).__railSeek?.(s);
  }, seconds);
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

  await page.goto("/selection-studio");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __railSeek?: unknown }).__railSeek === "function",
  );

  const tier = isMobile ? "mobile" : "desktop";

  const beats: [string, number][] = [
    ["01-arrival", 0.9],
    ["02-composition", 1.8],
    ["03-travel", 3.1],
    ["04-sweeping", 4.6],
    ["05-decelerating", 5.8],
    ["06-settling", 6.8],
    ["07-selected", 7.6],
    ["08-reveal", 8.4],
    ["09-held", 9.8],
  ];

  for (const [name, at] of beats) {
    await seek(page, at);
    await page.screenshot({ path: `${SHOTS}/${tier}-${name}.png` });
  }

  // The settled composition, which is how the sequence is actually seen —
  // development controls are collapsed by default.
  await seek(page, 8.6);
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}/${tier}-10-clean.png` });

  // And once with the panel open, to prove it opens and lands somewhere sane.
  await page.getByRole("button", { name: /^Controls$/i }).click();
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}/${tier}-11-controls.png` });

  const probe = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cards: document.querySelectorAll("[data-rail-card]").length,
  }));
  info.annotations.push({
    type: "capture",
    description: JSON.stringify({ tier, ...probe, consoleErrors: errors.slice(0, 8) }),
  });

  expect(probe.overflowX, "the composition must not overflow horizontally").toBe(false);
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
