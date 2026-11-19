import { expect, test } from "@playwright/test";

/**
 * The Final Draw, in its studio.
 *
 * These check that the controls are operations on one clock — that seeking,
 * pausing and replaying put the scene at an instant rather than leaving it in
 * a state nobody chose.
 *
 * The sequence is no longer what `/match` plays: the Selection Rail replaced it
 * as the production reveal, and the handoff into the results page is asserted
 * in `selection.spec.ts` against that. The route stays, and so do these, because
 * the work is intact and worth keeping runnable.
 */

test.describe("the studio", () => {
  test("every control is an operation on the clock", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/final-draw-studio");
    const main = page.locator("main");
    await expect(main).toBeVisible();

    const timeNow = () => main.getAttribute("data-time").then(Number);
    const stageNow = () => main.getAttribute("data-stage");

    // It starts itself, and pause actually stops it.
    await expect.poll(timeNow).toBeGreaterThan(0.3);
    await main.getByRole("button", { name: "Pause" }).click();
    const held = await timeNow();
    await page.waitForTimeout(450);
    expect(Math.abs((await timeNow()) - held), "paused means paused").toBeLessThan(0.05);

    // Stage navigation lands exactly on the stage it names.
    await main.getByRole("button", { name: /Interleaving/ }).click();
    expect(await stageNow()).toBe("interleaving");
    await main.getByRole("button", { name: /Unified stack/ }).click();
    expect(await stageNow()).toBe("settling");

    // Skip lands on a settled, complete reveal rather than mid-flip.
    await main.getByRole("button", { name: "Skip to reveal" }).click();
    expect(await stageNow()).toBe("revealed");
    await expect(main.getByText("x Crinacle Zero RED")).toBeVisible();

    // Reset returns to a genuinely empty stage, with nothing left over.
    await main.getByRole("button", { name: "Reset" }).click();
    expect(await timeNow()).toBe(0);
    expect(await stageNow()).toBe("idle");

    // Replay runs it again from the start rather than resuming where it was.
    await main.getByRole("button", { name: "Replay" }).click();
    await expect.poll(timeNow).toBeGreaterThan(0.2);
  });

  test("the same instant renders the same frame, whichever way you reach it", async ({ page }) => {
    await page.goto("/final-draw-studio");
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // The handle is installed by an effect, so a seek sent before mount is
    // silently dropped and the first sample is taken at whatever time the
    // sequence had reached on its own.
    await page.waitForFunction(
      () => typeof (window as unknown as { __finalDrawSeek?: unknown }).__finalDrawSeek === "function",
    );

    const transformsAt = async (seconds: number) => {
      await page.evaluate((s) => {
        (window as unknown as { __finalDrawSeek?: (n: number) => void }).__finalDrawSeek?.(s);
      }, seconds);
      await page.waitForTimeout(160);
      return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-fd-card]")).map((c) => c.style.transform),
      );
    };

    const forwards = await transformsAt(5.2);
    // Go somewhere else entirely, including past the end, and come back.
    await transformsAt(12.8);
    await transformsAt(0);
    await transformsAt(9.6);
    const backwards = await transformsAt(5.2);

    expect(backwards).toEqual(forwards);
    expect(forwards.length).toBeGreaterThan(0);
  });

  test("reduced motion gets a still, not a slideshow", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/final-draw-studio");
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // The settled reveal, and no transport at all — there is nothing to drive.
    await expect(main.getByText("Reduced motion")).toBeVisible();
    await expect(main.getByText("x Crinacle Zero RED")).toBeVisible();
    await expect(main.getByRole("button", { name: "Pause" })).toHaveCount(0);
  });
});
