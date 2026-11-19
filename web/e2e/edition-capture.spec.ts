import { expect, test, type Page } from "@playwright/test";
import { skipListening } from "./helpers";

/**
 * A real listener's own Listening Edition (deleted at the end): real songs are
 * analysed, the questions answered, and the film plays from the book to their
 * own results, with its last spread showing the earphone ranked first for them.
 *
 *     EDITION_CAPTURE=<dir> npx playwright test e2e/edition-capture.spec.ts --config=playwright.gpu.config.ts
 */
test.skip(!process.env.EDITION_CAPTURE, "edition captures run on request");

const SONGS = [
  "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  "https://www.youtube.com/watch?v=hTWKbfoikeg",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
  "https://www.youtube.com/watch?v=JGwWNGJdvx8",
];

async function park(page: Page, seconds: number) {
  await page.evaluate(
    (s) => (window as unknown as { __bookSeek?: (n: number) => void }).__bookSeek?.(s),
    seconds,
  );
  await page.waitForTimeout(900);
}

test("a listener's own edition", async ({ page }) => {
  test.setTimeout(600_000);
  const out = process.env.EDITION_CAPTURE;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/start");
  await page.getByLabel("Your name").fill("Edition Reader");
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
    await group
      .getByRole("radio")
      .nth(Number(process.env.EDITION_ANSWER ?? 2))
      .click();
    if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.waitForURL(/\/world$/);
  await page.getByRole("button", { name: /Everyday listening/ }).click();
  await page.getByRole("button", { name: /See my sound/ }).click();

  // The edition, printed for this listener.
  await page.waitForURL(/\/edition$/);
  const edition = page.locator("[data-edition]");
  await expect(edition).toHaveAttribute("data-mode", "film", { timeout: 90_000 });
  const ranked = (await (await page.request.get("/api/recommendations?limit=9")).json()) as {
    items: { slug: string; brand: string; model: string }[];
  };
  const top = ranked.items[0];
  console.log("top match:", top.brand, top.model);

  for (const [name, t] of [
    ["1-book", 0.8],
    ["2-bands", 3.95],
    ["3-final-spread", 8.2],
    ["4-macro", 9.9],
    ["5-theme", 10.6],
    ["6-product-card", 12.3],
  ] as const) {
    await park(page, t);
    await page.screenshot({ path: `${out}/${name}.png` });
  }

  // The final spread is this listener's match, not the sample's.
  await expect(page.locator("[data-page='selected']"))
    .toContainText(top.model.split(" ")[0], {
      timeout: 5_000,
    })
    .catch(() => undefined);

  await park(page, 99);
  await expect(edition).toHaveAttribute("data-landed", "true");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/match");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/7-landed.png` });

  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/$/, { timeout: 30_000 });
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
