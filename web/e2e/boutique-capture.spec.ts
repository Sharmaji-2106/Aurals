import { expect, test, type Page } from "@playwright/test";

/**
 * Capture the boutique, for looking at.
 *
 * A camera, not an assertion suite. A 3D environment can compile, pass every
 * behavioural test and still be ugly, badly lit or composed wrong, and the only
 * way to find that out is to look at it.
 *
 *   CAPTURE=1 npx playwright test e2e/boutique-capture.spec.ts
 *
 * Writes to test-results/boutique/. Opt-in, because it is a tool: it takes
 * workers away from tests that actually assert something.
 */

const SHOTS = "test-results/boutique";

/** The camera eases, so a shot has to wait for it to arrive. */
async function settle(page: Page, ms = 2200) {
  await page.waitForTimeout(ms);
}

test("capture the environment", async ({ page, isMobile }, info) => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to write frames");
  test.setTimeout(240_000);

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  const tier = isMobile ? "mobile" : "desktop";
  await page.goto("/boutique-studio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 40_000 });
  // The GLB has to arrive and the first frames have to be drawn.
  await settle(page, 4000);

  await page.screenshot({ path: `${SHOTS}/${tier}-01-arrival.png` });

  await page.getByRole("button", { name: "Show full shelf" }).click();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/${tier}-02-full-shelf.png` });

  // Hover a display through its control-strip proxy, which drives exactly the
  // same state the pointer does.
  await page.getByTitle("Hidition Viento").hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${tier}-03-hovered.png` });

  await page.getByRole("button", { name: "Focus recommended" }).click();
  await settle(page, 2600);
  await page.screenshot({ path: `${SHOTS}/${tier}-04-recommended-focus.png` });

  await page.getByTitle("AKG N5005").click();
  await settle(page, 2600);
  await page.screenshot({ path: `${SHOTS}/${tier}-05-other-product.png` });

  await page.getByRole("button", { name: "Focus recommended" }).click();
  await settle(page, 2600);
  await page.getByRole("button", { name: "View your recommendation" }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${SHOTS}/${tier}-06-overlay.png` });

  const probe = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    canvases: document.querySelectorAll("canvas").length,
  }));
  info.annotations.push({
    type: "capture",
    description: JSON.stringify({ tier, ...probe, consoleErrors: errors.slice(0, 8) }),
  });

  expect(probe.overflowX, "the composition must not overflow horizontally").toBe(false);
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
