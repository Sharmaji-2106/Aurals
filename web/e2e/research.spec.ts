import { expect, test } from "@playwright/test";

import { skipListening } from "./helpers";

/**
 * The research and recommendation screens rest on real data: measurements imported
 * from AutoEq and a curated gathering of published reviews. These tests check that
 * what reaches the screen is that data, including the places it disagrees with itself.
 */
test.describe("research and recommendations", () => {
  test("the evidence keeps its sources, its links and its disagreements", async ({ page }) => {
    await page.goto("/research/moondrop-aria");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Moondrop");
    // The reveal is never a trap. On a phone there is no reveal to skip.
    const skip = page.getByRole("button", { name: /Skip to the evidence/ });
    if (await skip.count()) await skip.click();
    await expect(skip).toHaveCount(0);

    // A contested theme shows both readings rather than a verdict.
    await page
      .getByRole("button", { name: /^Treble/ })
      .first()
      .click();
    await expect(page.getByText("Reviewers disagree about treble.")).toBeVisible();
    await expect(page.getByText(/rolls off fast post 11KHz/).first()).toBeVisible();
    await expect(page.getByText(/good amount of sparkle and airiness/).first()).toBeVisible();

    // Every quote says who decided what it is about.
    await expect(page.getByText(/tagged by AURALS/).first()).toBeVisible();

    // And the original is one click away, at its real address.
    await page.locator("article button").first().click();
    const link = page.getByRole("link", { name: /Read the original on/ }).first();
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("href", /^https:\/\//);
  });

  test("the research is presented as a snapshot, not a live crawl", async ({ page }) => {
    await page.goto("/research/moondrop-aria");
    await expect(page.getByText(/AURALS is not reading the web while you watch/)).toBeVisible();
  });

  test("matches come from the engine, with what it could not do", async ({ page }) => {
    await page.goto("/start");
    await page.getByLabel("Your name").fill("Match Reader");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/music$/);

    const { questions } = (await (await page.request.get("/api/questionnaire")).json()) as {
      questions: { prompt: string; kind: "scale" | "choice" }[];
    };
    await page.goto("/tune");
    await skipListening(page);
    for (const question of questions) {
      const group = page.getByRole("radiogroup", { name: question.prompt });
      await group.getByRole("radio").first().click();
      if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: /See my sound/ }).click();
    await expect(page).toHaveURL(/\/world$/);
    await page.getByRole("button", { name: /Everyday listening/ }).click();
    await page.getByRole("button", { name: /See my sound/ }).click();
    await expect(page).toHaveURL(/\/match$/);

    await page.goto("/match");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your sound has a");
    // The note follows the engine's current price coverage. It disappears once
    // sourced price observations allow the engine to apply a budget.
    const recommendationResponse = await page.request.get("/api/recommendations?limit=9");
    expect(recommendationResponse.ok()).toBe(true);
    const { notes } = (await recommendationResponse.json()) as { notes: string[] };
    const noPrices = notes.some((note) => note.includes("budgets can't be applied"));
    await expect(page.getByText(/budgets can't be applied/)).toHaveCount(noPrices ? 1 : 0);
    // The ranking basis is stated, and the contexts are explicitly not part of it.
    await expect(page.getByText(/does not change this ranking/).first()).toBeVisible();
    // The evidence we do have is reachable from here.
    await expect(page.getByRole("link", { name: /Open the evidence/ })).toBeVisible();
  });
});
