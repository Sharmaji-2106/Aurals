import { expect, test } from "@playwright/test";

import { skipListening } from "./helpers";

test.describe("onboarding", () => {
  test("landing leads to profile creation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("beyond what you hear");
    await page
      .getByRole("link", { name: /Find my sound/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  });

  test("the departure runs once, clears itself and leaves the name field ready", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Find my sound/ })
      .first()
      .click();

    // Exactly one departure, checked while it is still on screen: the overlay is
    // short-lived now and a second one would be visible here if `begin` ever
    // stopped guarding against it.
    const overlay = page.locator("[data-spectral-transition]");
    await expect(overlay).toHaveCount(1);

    await page.waitForURL(/\/start$/, { timeout: 8_000 });
    await expect(page.getByLabel("Your name")).toBeVisible();

    // It always clears itself, even when the destination was slow to mount — the
    // reveal waits for the next route but will not hold for it indefinitely.
    // This bound is what stops the 6.8s version coming back; it is measured from
    // the click rather than from page load so it is about the transition and not
    // about how long the dev server took to compile a route.
    await expect(overlay).toHaveCount(0, { timeout: 7_000 });
  });

  test("music links are validated as you type", async ({ page }) => {
    await page.goto("/start");
    await page.getByLabel("Your name").fill("E2E Listener");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/music$/);

    const links = page.getByLabel("YouTube links");
    await links.fill("https://vimeo.com/123");
    await expect(page.getByText("Only YouTube links work")).toBeVisible();
    await expect(page.getByRole("button", { name: /Measure/ })).toBeDisabled();

    await links.fill(
      "https://youtu.be/5NV6Rdv1a3I\nhttps://www.youtube.com/playlist?list=PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm",
    );
    await expect(page.getByText("2 links ready")).toBeVisible();
    await expect(page.getByRole("button", { name: /Measure 2 links/ })).toBeEnabled();
  });

  test("spotify playlists are accepted alongside youtube links", async ({ page }) => {
    await page.goto("/start");
    await page.getByLabel("Your name").fill("Spotify Paster");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page).toHaveURL(/\/music$/);

    const links = page.getByLabel("YouTube links");
    // A Spotify link that is not a playlist is refused in Spotify's own words,
    // never with the YouTube parser's message.
    await links.fill("https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M");
    await expect(page.getByText(/Spotify album links aren't supported/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Measure/ })).toBeDisabled();

    await links.fill(
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M\nhttps://youtu.be/5NV6Rdv1a3I",
    );
    await expect(page.getByText("2 links ready")).toBeVisible();
    await expect(page.getByText("Spotify playlist").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Measure 2 links/ })).toBeEnabled();
  });

  test("questionnaire builds a sound profile, and data can be deleted", async ({ page }) => {
    await page.goto("/start");
    await page.getByLabel("Your name").fill("Quiz Taker");
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
      // Choice questions advance on their own; scales need an explicit "Next".
      if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await expect(page.getByRole("heading", { level: 1 })).toContainText("practical");
    await page.getByRole("button", { name: /See my sound/ }).click();

    // The listening-world step sits between the questions and the reveal. The
    // contexts are kept with the profile and shown there; they do not rank anything.
    await expect(page).toHaveURL(/\/world$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Where does your sound");
    await page.getByRole("button", { name: /Everyday listening/ }).click();
    await page.getByRole("button", { name: /Competitive gaming/ }).click();
    // Picking a second context reveals the "most important" refinement in place.
    await expect(page.getByText("Most", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /See my sound/ }).click();

    // The sound profile is no longer a page of its own: it arrives on the
    // results screen, beside the matches it explains.
    await expect(page).toHaveURL(/\/match$/);
    // The results are the page: no sequence plays over them.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Everyday listening").first()).toBeVisible();
    await expect(page.getByText("Quiz Taker’s sound")).toBeVisible();
    // The result leads; the method no longer opens the page.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your sound has a");
    // Choosing the lowest option everywhere reads as a light, relaxed, smooth sound.
    await expect(page.getByText("Restrained bass.")).toBeVisible();
    // Without music the profile says what it rests on, in words rather than numbers.
    await expect(page.getByText(/Read from your answers alone, until you add music/)).toBeVisible();
    await expect(page.getByText("Your music is the strongest evidence")).toBeVisible();

    // Nothing from the old profile page was dropped: it moved behind disclosure.
    await page.getByRole("button", { name: /Your line, band by band/ }).click();
    await expect(page.getByRole("radio", { name: "Music" })).toBeDisabled();
    await page.getByRole("button", { name: /Every dimension/ }).click();
    await expect(page.getByText("From your answers").first()).toBeVisible();

    await page.getByRole("button", { name: "Delete my data" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/match");
    await expect(page).toHaveURL(/\/start$/);
  });
});
