import { expect, test } from "@playwright/test";
import { skipListening } from "./helpers";

/**
 * `/match` and `/card` for a real listener with real music (deleted at the end):
 * the Sound Card is drawn from their own analysed songs, then the results follow.
 *
 *     MATCH_CAPTURE=<dir> npx playwright test e2e/match-capture.spec.ts --config=playwright.gpu.config.ts
 */
test.skip(!process.env.MATCH_CAPTURE, "match captures run on request");

const SONGS = [
  "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  "https://www.youtube.com/watch?v=hTWKbfoikeg",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
  "https://www.youtube.com/watch?v=JGwWNGJdvx8",
];

/** Elements that reach past the page's own width (a horizontal scrollbar). */
async function offenders(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 8)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} → ${Math.round(el.getBoundingClientRect().right)}/${width}`,
      );
  });
}

test("the listener's own card and results", async ({ page }) => {
  test.setTimeout(600_000);
  const out = process.env.MATCH_CAPTURE;
  const shot = async (name: string, wait = 1200) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/start");
  await page.getByLabel("Your name").fill("Card Capture");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(/\/music$/);
  const created = await page.request.post("/api/music/submissions", {
    data: { urls: SONGS },
    headers: { "x-auralis-client": "web" },
  });
  expect(created.ok()).toBeTruthy();
  await expect
    .poll(async () => (await page.request.get("/api/music/profile")).status(), {
      timeout: 300_000,
      intervals: [3000],
    })
    .toBe(200);

  const { questions } = (await (await page.request.get("/api/questionnaire")).json()) as {
    questions: { prompt: string; kind: "scale" | "choice" }[];
  };
  await page.goto("/tune");
  await skipListening(page);
  for (const question of questions) {
    const group = page.getByRole("radiogroup", { name: question.prompt });
    await group.getByRole("radio").nth(2).click();
    if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.waitForURL(/\/(world|analysis\/.+)$/);
  if (page.url().includes("/world")) {
    await page.getByRole("button", { name: /Everyday listening/ }).click();
    await page.getByRole("button", { name: /See my sound/ }).click();
  }
  await page.goto("/match");

  const card = page.locator("[data-section='sound-card'][data-card-done='true']");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Card Capture’s music");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await shot("1-match-card", 600);
  expect(await offenders(page)).toEqual([]);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 900 * 0.9; y < height - 450 && i < 7; y += 900 * 0.9) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await shot(`2-match-${i++}`, 900);
  }

  await page.goto("/card");
  await expect(page.locator("[data-section='sound-card'][data-card-done='true']")).toBeVisible({
    timeout: 60_000,
  });
  await shot("3-card", 600);
  await page.getByRole("button", { name: /Turn it over/ }).click();
  await shot("4-card-back", 1800);

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/match");
  await expect(page.locator("[data-section='sound-card'][data-card-done='true']")).toBeVisible({
    timeout: 60_000,
  });
  await shot("5-match-phone", 600);
  expect(await offenders(page)).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/$/, { timeout: 30_000 });
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
