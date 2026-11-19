import type { Page } from "@playwright/test";

/**
 * Walk a new listener from the landing page to their results.
 *
 * The shortest honest route: a name, every question answered, a listening
 * context, and the results. It stops as `/match` loads.
 */
export async function completeOnboarding(page: Page, name = "Match Watcher"): Promise<void> {
  await page.goto("/start");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: /Continue/ }).click();

  const { questions } = (await (await page.request.get("/api/questionnaire")).json()) as {
    questions: { prompt: string; kind: "scale" | "choice" }[];
  };
  await page.goto("/tune");
  await skipListening(page);
  for (const question of questions) {
    const group = page.getByRole("radiogroup", { name: question.prompt });
    await group.getByRole("radio").first().click();
    if (question.kind === "scale") {
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
  }
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.getByRole("button", { name: /Everyday listening/ }).click();
  await page.getByRole("button", { name: /See my sound/ }).click();
  await page.waitForURL(/\/match$/);
}

/**
 * Pass the listening session at the start of /tune the way a person can: by
 * choosing "Skip to the questions". Returns immediately when it is not shown.
 */
export async function skipListening(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip to the questions" });
  try {
    await skip.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    return;
  }
  await skip.click();
}
