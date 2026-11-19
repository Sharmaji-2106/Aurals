import { test } from "@playwright/test";
import { skipListening } from "./helpers";

/**
 * Review captures of the site's pages, top to bottom.
 *
 *     SITE_CAPTURE=<dir> npx playwright test e2e/site-capture.spec.ts --config=playwright.gpu.config.ts
 *
 * Optional: SITE_ROUTES="/,/start" and SITE_W / SITE_H for the viewport.
 */
test.skip(!process.env.SITE_CAPTURE, "review captures run on request");

const ROUTES = (process.env.SITE_ROUTES ?? "/,/start,/music,/tune,/match,/profile,/method,/world").split(",");

for (const route of ROUTES) {
  test(`capture ${route}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({
      width: Number(process.env.SITE_W ?? 1440),
      height: Number(process.env.SITE_H ?? 900),
    });
    await page.goto(route);
    await page.waitForTimeout(Number(process.env.SITE_WAIT ?? 2500));
    const name = route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    await page.screenshot({ path: `${process.env.SITE_CAPTURE}/${name}-top.png` });
    // Walk down the page so scroll-driven sections play, then take it whole.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 600) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(250);
    }
    // A fixed scene does not survive a full-page capture, so the page is also
    // shot screen by screen, as it is seen.
    const { height: vh } = page.viewportSize()!;
    if (process.env.SITE_STOPS) {
      let i = 0;
      for (let y = 0; y < height - vh / 2; y += vh * 0.9) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
        await page.waitForTimeout(1400);
        await page.screenshot({
          path: `${process.env.SITE_CAPTURE}/${name}-stop-${String(i++).padStart(2, "0")}.png`,
        });
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${process.env.SITE_CAPTURE}/${name}-full.png`, fullPage: true });
    console.log(route, "height", height, "errors:", errors.length ? errors.slice(0, 3).join(" | ") : "none");
  });
}

/**
 * The journey, step by step, for a throwaway listener whose data is deleted
 * at the end: SITE_JOURNEY=1 alongside SITE_CAPTURE.
 */
test("capture the journey", async ({ page }) => {
  test.skip(!process.env.SITE_JOURNEY, "journey captures run on request");
  test.setTimeout(240_000);
  const out = process.env.SITE_CAPTURE;
  const shot = async (name: string) => {
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/journey-${name}.png` });
  };
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({
    width: Number(process.env.SITE_W ?? 1440),
    height: Number(process.env.SITE_H ?? 900),
  });
  await page.goto("/start");
  await shot("1-start");
  await page.getByLabel("Your name").fill("Preview Listener");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(/\/music$/);
  await shot("2-music");
  const { questions } = (await (await page.request.get("/api/questionnaire")).json()) as {
    questions: { prompt: string; kind: "scale" | "choice" }[];
  };
  await page.goto("/tune");
  await skipListening(page);
  await shot("3-tune");
  for (const question of questions) {
    const group = page.getByRole("radiogroup", { name: question.prompt });
    await group.getByRole("radio").nth(1).click();
    if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await shot("4-practical");
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.waitForURL(/\/world$/);
  await shot("5-world");
  await page.getByRole("button", { name: /Everyday listening/ }).click();
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.waitForURL(/\/match$/);
  await shot("7-match");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const { height: vh } = page.viewportSize()!;
  let i = 0;
  for (let y = vh * 0.9; y < height - vh / 2 && i < 8; y += vh * 0.9) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await shot(`8-match-${i++}`);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/$/);
  console.log("journey errors:", errors.length ? errors.slice(0, 4).join(" | ") : "none");
});
