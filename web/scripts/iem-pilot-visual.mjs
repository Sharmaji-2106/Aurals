import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const base = "http://localhost:3000";
const output = resolve("../data/iem/reports/screenshots");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
const headers = { "x-auralis-client": "web" };
let created = false;
try {
  const session = await context.request.post(`${base}/api/session`, {
    headers,
    data: { display_name: "IEM Pilot QA" },
  });
  if (!session.ok()) throw new Error(`session: ${session.status()} ${await session.text()}`);
  created = true;
  const answers = await context.request.post(`${base}/api/questionnaire/responses`, {
    headers,
    data: {
      version: "perceptual/1",
      answers: {
        bass_amount: "4",
        tone: "3",
        vocals: "3",
        treble_feel: "fine",
      },
    },
  });
  if (!answers.ok()) throw new Error(`questionnaire: ${answers.status()} ${await answers.text()}`);
  const recommendations = await context.request.get(`${base}/api/recommendations?limit=9`);
  if (!recommendations.ok()) throw new Error(`recommendations: ${recommendations.status()}`);
  const data = await recommendations.json();
  const chosen = data.items.find((item) => item.slug === "moondrop-variations");
  if (!chosen?.image?.path) throw new Error("Variations image is absent from the live top nine");
  console.log("Variations rank and image:", chosen.rank, chosen.image.path);

  const page = await context.newPage();
  await page.goto(`${base}/match`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const rowButton = page.getByRole("button", { name: /Variations/i }).first();
  await rowButton.waitFor({ timeout: 60000 });
  await page.keyboard.press("Escape");
  await rowButton.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 330));
  await rowButton.hover();
  const image = page.locator('img[alt="Moondrop Variations"]:visible').first();
  await image.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  const decoded = await page.evaluate(() =>
    [...document.images].some(
      (element) => element.alt === "Moondrop Variations" && element.complete && element.naturalWidth > 0,
    ),
  );
  if (!decoded) {
    throw new Error("Variations photograph did not decode on /match");
  }
  await page.screenshot({ path: resolve(output, "match-variations-card.png") });
  await rowButton.click();
  const dialog = page.getByRole("dialog", { name: /Moondrop Variations/i });
  await dialog.waitFor({ timeout: 10000 });
  const detailImage = dialog.locator('img[alt="Moondrop Variations"]');
  await detailImage.waitFor();
  if (!(await detailImage.evaluate((element) => element.complete && element.naturalWidth > 0))) {
    throw new Error("Variations photograph did not decode in detail");
  }
  await page.waitForTimeout(1400);
  await page.screenshot({ path: resolve(output, "match-variations-detail.png") });
  console.log("card and detail screenshots saved");
} finally {
  if (created) {
    const deleted = await context.request.delete(`${base}/api/me`, { headers });
    console.log("temporary QA account removed:", deleted.status());
  }
  await browser.close();
}
