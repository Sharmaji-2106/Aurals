import { test } from "@playwright/test";

/**
 * Review captures of the Sound Card studio (lineup and stage).
 *
 *     CARD_CAPTURE=<dir> npx playwright test e2e/card-capture.spec.ts --config=playwright.gpu.config.ts
 */
test.skip(!process.env.CARD_CAPTURE, "review captures run on request");

test("lineup", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/card-studio");
  await page.waitForFunction(
    () => Number(document.querySelector("main")?.getAttribute("data-lineup")) >= 4,
    null,
    {
      timeout: 120_000,
    },
  );
  await page.waitForTimeout(800);
  const cards = page.locator("[data-card]");
  for (let i = 0; i < (await cards.count()); i++) {
    const slug = await cards.nth(i).getAttribute("data-card");
    await cards.nth(i).screenshot({ path: `${process.env.CARD_CAPTURE}/lineup-${slug}.png` });
  }
  await page.waitForFunction(
    () => Number(document.querySelector("main")?.getAttribute("data-finishes")) >= 14,
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(500);
  await page
    .locator("[data-finish-gallery]")
    .screenshot({ path: `${process.env.CARD_CAPTURE}/finishes.png` });
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
});

test("stage", async ({ page }) => {
  test.setTimeout(240_000);
  const slug = process.env.CARD_STAGE ?? "neon-odyssey";
  const times = (process.env.CARD_TIMES ?? "0.5,2,3.5,5,7,10,12.6,13.5,15,16.5,19").split(",").map(Number);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/card-studio?stage=${slug}`);
  await page.waitForFunction(
    () => Boolean((window as unknown as { __cardSeek?: unknown }).__cardSeek),
    null,
    {
      timeout: 120_000,
    },
  );
  const total = await page.locator("[data-total]").getAttribute("data-total");
  console.log("total", total);
  for (const t of times) {
    await page.evaluate((s) => (window as unknown as { __cardSeek: (n: number) => void }).__cardSeek(s), t);
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `${process.env.CARD_CAPTURE}/stage-${slug}-${String(t).padStart(5, "0")}.png`,
    });
  }
  console.log("console errors:", errors.length ? errors.join("\n") : "none");
});
