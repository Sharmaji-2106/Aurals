import { test } from "@playwright/test";

test.skip(!process.env.BOOK_SHEET, "proof sheet on request");

test("proof sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/book-studio?sheet");
  await page.locator("[data-sheet]").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const figures = page.locator("[data-sheet] figure");
  const n = await figures.count();
  for (let i = 0; i < n; i++) {
    await figures
      .nth(i)
      .screenshot({ path: `${process.env.BOOK_SHEET}/spread-${String(i).padStart(2, "0")}.png` });
  }
});
