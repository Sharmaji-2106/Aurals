import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

/**
 * The Selection Rail, in the studio and in the product.
 *
 * The studio tests check that the sequence is a function of its clock — that
 * seeking, pausing and replaying put it at an instant rather than leaving it in
 * a state nobody chose — and that the one unmissable requirement holds: the
 * winning card comes to rest exactly in the centre of the frame.
 *
 * The rail is a studio piece now: `/match` no longer plays a sequence over
 * the results. Its test checks that the page opens on the result itself, with
 * the engine's own top earphone in the Spotlight and nothing over it.
 */

const stageOf = (page: Page) => page.locator("main").getAttribute("data-stage");
const timeOf = (page: Page) => page.locator("main").getAttribute("data-time").then(Number);

async function openStudio(page: Page) {
  await page.goto("/selection-studio");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __railSeek?: unknown }).__railSeek === "function",
  );
}

async function seek(page: Page, seconds: number) {
  await page.evaluate((s) => {
    (window as unknown as { __railSeek?: (n: number) => void }).__railSeek?.(s);
  }, seconds);
  await page.waitForTimeout(180);
}

test.describe("the selection rail", () => {
  test("the winning card comes to rest exactly in the centre", async ({ page }) => {
    test.setTimeout(90_000);
    await openStudio(page);
    await seek(page, 9.6);

    const winner = page.locator("[data-rail-winner='true']");
    await expect(winner).toBeVisible();

    // Measured against the frame the composition actually occupies, not the
    // window. This project sets `scrollbar-gutter: stable`, so a 1280 px window
    // gives a 1270 px content area — and the centre a viewer sees is the centre
    // of that, 5 px left of where `window.innerWidth / 2` would put it.
    const box = (await winner.boundingBox())!;
    const frame = (await page.locator("main").boundingBox())!;
    const centre = box.x + box.width / 2;
    const want = frame.x + frame.width / 2;

    // Not "about centred". The rail's resting offset is defined as the value
    // that puts this card on the centre line, so anything more than a rounding
    // error means something is drifting.
    expect(Math.abs(centre - want), `card centre ${centre} against frame centre ${want}`).toBeLessThan(1.5);
  });

  test("the same instant renders the same frame, whichever way you reach it", async ({ page }) => {
    test.setTimeout(90_000);
    await openStudio(page);

    const transforms = async (at: number) => {
      await seek(page, at);
      return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-rail-card]")).map(
          (c) => `${c.dataset.railCard}:${c.style.transform}:${c.style.opacity}`,
        ),
      );
    };

    const first = await transforms(4.2);
    await transforms(10.9);
    await transforms(0);
    await transforms(7.3);
    expect(await transforms(4.2)).toEqual(first);
    expect(first.length).toBeGreaterThan(2);
  });

  test("the sequence is a real sequence: cards travel, then stop", async ({ page }) => {
    test.setTimeout(90_000);
    await openStudio(page);

    // The card's centre, not its left edge: the chosen card keeps growing for
    // a beat after the rail stops, and a growing box moves its own left edge
    // while its centre stays exactly where it was put.
    const winnerX = async (at: number) => {
      await seek(page, at);
      const box = await page.locator("[data-rail-winner='true']").boundingBox();
      return box ? box.x + box.width / 2 : null;
    };

    const early = await winnerX(2.4);
    const mid = await winnerX(4.6);
    const settled = await winnerX(7.2);
    const later = await winnerX(10.4);

    // It moves leftward through the frame...
    expect(early).not.toBeNull();
    expect(mid!).toBeLessThan(early!);
    expect(settled!).toBeLessThan(mid!);
    // ...and then it stops, rather than drifting on.
    expect(Math.abs(later! - settled!)).toBeLessThan(2);
  });

  test("only the chosen card quotes a number", async ({ page }) => {
    test.setTimeout(90_000);
    await openStudio(page);

    // Mid-travel, nothing has been chosen, so nothing claims a score.
    await seek(page, 3.4);
    await expect(page.getByText("Your strongest match")).toHaveCount(0);
    await expect(page.getByText(/interval$/)).toHaveCount(0);

    // Once it settles, the winner shows the engine's own figures.
    await seek(page, 9.2);
    await expect(page.getByText("Your strongest match")).toBeVisible();
    await expect(page.getByText("84.6")).toBeVisible();
    await expect(page.getByText(/79\.7–89\.2 interval/)).toBeVisible();
    await expect(page.getByText("Close match")).toBeVisible();
    // And says who measured the portrait it is drawn from.
    await expect(page.getByText(/oratory1990/i).first()).toBeVisible();
  });

  test("every control is an operation on the clock", async ({ page }) => {
    test.setTimeout(90_000);
    await openStudio(page);
    const main = page.locator("main");

    await main.getByRole("button", { name: /^Controls$/i }).click();

    await expect.poll(() => timeOf(page)).toBeGreaterThan(0.2);
    await main.getByRole("button", { name: "Pause" }).click();
    const held = await timeOf(page);
    await page.waitForTimeout(420);
    expect(Math.abs((await timeOf(page)) - held), "paused means paused").toBeLessThan(0.05);

    await main.getByRole("button", { name: /Deceleration/ }).click();
    expect(await stageOf(page)).toBe("deceleration");

    await main.getByRole("button", { name: "Skip to selection" }).click();
    expect(await stageOf(page)).toBe("selection");

    await main.getByRole("button", { name: "Skip to reveal" }).click();
    expect(await stageOf(page)).toBe("reveal");
    await expect(main.getByText("x Crinacle Zero RED")).toBeVisible();

    await main.getByRole("button", { name: "Reset" }).click();
    expect(await timeOf(page)).toBe(0);
    expect(await stageOf(page)).toBe("arrival");

    await main.getByRole("button", { name: "Replay" }).click();
    await expect.poll(() => timeOf(page)).toBeGreaterThan(0.2);
  });

  test("reduced motion gets a still, not a sequence", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/selection-studio");
    const main = page.locator("main");
    await expect(main).toBeVisible();
    await expect(main.getByText("Reduced motion")).toBeVisible();
    await expect(main.getByText("x Crinacle Zero RED")).toBeVisible();
    await expect(main.getByRole("button", { name: /^Controls$/i })).toHaveCount(0);
  });
});

test("/match opens on the result, with nothing played over it", async ({ page }) => {
  test.slow();
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await completeOnboarding(page, "Result Reader");

  // The engine's own first choice is the Spotlight, and it is shown once.
  const ranked = (await (await page.request.get("/api/recommendations?limit=9")).json()) as {
    items: { slug: string }[];
  };
  const art = page.locator("[data-art]");
  await expect(art).toHaveCount(1, { timeout: 30_000 });
  await expect(art).toHaveAttribute("data-art", ranked.items[0].slug);
  await expect(page.getByText("Your strongest match").first()).toBeVisible();
  // No sequence, overlay or skip control between the listener and the result.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Go to your results/ })).toHaveCount(0);

  await page.screenshot({ path: "test-results/selection/match-direct.png" });
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  // Deleting is real work on a shared API; under the full suite it can be slow.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
