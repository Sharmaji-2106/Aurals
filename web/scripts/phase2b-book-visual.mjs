import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("../data/iem/reports/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, config] of [
    ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
    ["phone", devices["Pixel 7"]],
  ]) {
    const context = await browser.newContext(config);
    const page = await context.newPage();
    await page.goto("http://localhost:3000/book-studio", { waitUntil: "domcontentloaded" });
    await page.locator("[data-layer='match'] [data-art='truthear-nova'] img").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("[data-layer='match'] [data-section='sound-card']").waitFor({ state: "visible" });
    const dusk = page.locator("[data-layer='match'] img[alt*='Dusk']:visible").first();
    await dusk.scrollIntoViewIfNeeded();
    await dusk.waitFor({ state: "visible" });
    if (!(await dusk.evaluate((img) => img.complete && img.naturalWidth > 0))) {
      throw new Error(`${name}: Dusk image did not decode`);
    }
    await page.screenshot({ path: resolve(output, `phase2b-book-match-${name}.png`) });
    const card = dusk.locator("xpath=ancestor::button[1]");
    await card.click();
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor({ state: "visible" });
    const detail = dialog.locator("img[alt*='Dusk']").first();
    await detail.waitFor();
    if (!(await detail.evaluate((img) => img.complete && img.naturalWidth > 0))) {
      throw new Error(`${name}: detail image did not decode`);
    }
    await page.screenshot({ path: resolve(output, `phase2b-book-detail-${name}.png`) });
    console.log(`${name}: sample /match card and detail image decoded; screenshots saved`);
    await context.close();
  }
} finally {
  await browser.close();
}
