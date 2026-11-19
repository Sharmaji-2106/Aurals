import { expect, test, type Page } from "@playwright/test";

/**
 * The boutique's behaviour.
 *
 * The scene itself cannot be asserted — whether walnut looks like walnut is a
 * question for the eye, and the capture harness exists for that. What can be
 * asserted is everything around it: that the environment loads, that pointing
 * at a display identifies it, that selecting one moves the camera there rather
 * than teleporting it, that the overlay carries the engine's real numbers, and
 * that closing it puts you back exactly where you were.
 */

const PHASE = (page: Page) => page.locator("main").getAttribute("data-phase");
const SELECTED = (page: Page) => page.locator("main").getAttribute("data-selected");

async function open(page: Page) {
  await page.goto("/boutique-studio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 40_000 });
  // The GLB has to arrive before anything can be pointed at.
  await page.waitForTimeout(2500);
}

// One at a time. Each of these loads a full WebGL scene, and in the default
// harness that scene is rasterised on the CPU — five of them at once starved
// the rest of the suite badly enough to time out journey tests in other files.
test.describe.configure({ mode: "serial" });

test.describe("the boutique", () => {
  test("the environment loads and settles", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await open(page);
    expect(await PHASE(page)).toBe("establishing");

    // One canvas, one context. A second would mean the scene was rebuilt.
    expect(await page.locator("canvas").count()).toBe(1);
    await expect(page.getByText("Development demo")).toBeVisible();
    expect(errors, errors.join(" | ")).toHaveLength(0);
  });

  test("pointing at a display identifies it", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);

    await page.getByTitle("Hidition Viento").hover();
    await expect(page.getByText("Viento", { exact: true })).toBeVisible();
    await expect(page.getByText("Hidition")).toBeVisible();

    // Labels are a control, and the control works.
    await page.getByRole("button", { name: "Labels" }).click();
    await expect(page.getByText("Viento", { exact: true })).toHaveCount(0);
  });

  test("selecting a display moves the camera rather than cutting to it", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);

    const camera = () =>
      page.evaluate(() => document.querySelector("main")?.getAttribute("data-phase") ?? "");

    await page.getByRole("button", { name: "Focus recommended" }).click();
    expect(await camera()).toBe("focused");
    expect(await SELECTED(page)).toBe("truthear-x-crinacle-zero-red");

    // The move takes time: a frame later the camera is still on its way, and
    // only after it has eased does the view report itself settled.
    await expect(page.getByText("The view is moving.")).toBeAttached();
    await expect(page.getByText("The view has settled.")).toBeAttached({ timeout: 15_000 });
  });

  test("the overlay carries the engine's own numbers, and closing it returns", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);

    await page.getByRole("button", { name: "Focus recommended" }).click();
    await page.waitForTimeout(2200);
    await page.getByRole("button", { name: "View your recommendation" }).click();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Truthear")).toBeVisible();
    await expect(panel.getByText("x Crinacle Zero RED")).toBeVisible();
    // The score, its interval and its grade, as the engine produced them.
    await expect(panel.getByText("84.6")).toBeVisible();
    await expect(panel.getByText(/79\.7–89\.2 interval/)).toBeVisible();
    await expect(panel.getByText("Close match")).toBeVisible();
    // And who measured it, because the curve is somebody's work.
    await expect(panel.getByText(/oratory1990/i)).toBeVisible();
    // Nothing is claimed that is not held.
    await expect(panel.getByText(/holds no photograph/i)).toBeVisible();

    // The boutique is still there behind it.
    await expect(page.locator("canvas")).toBeVisible();

    // Closing returns to the display it opened from, with the camera untouched.
    await page.getByRole("button", { name: "Back to the boutique" }).click();
    await expect(panel).toHaveCount(0);
    expect(await PHASE(page)).toBe("focused");
    expect(await SELECTED(page)).toBe("truthear-x-crinacle-zero-red");
    expect(await page.locator("canvas").count()).toBe(1);
  });

  test("every demo control does something", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);

    await page.getByRole("button", { name: "Show full shelf" }).click();
    expect(await PHASE(page)).toBe("browsing");

    await page.getByTitle("AKG N5005").click();
    expect(await PHASE(page)).toBe("focused");
    expect(await SELECTED(page)).toBe("akg-n5005");

    await page.getByRole("button", { name: "Reset camera" }).click();
    expect(await PHASE(page)).toBe("establishing");
    expect(await SELECTED(page)).toBe("");

    // Opening the recommendation from scratch still lands on the recommended
    // product rather than on nothing.
    await page.getByRole("button", { name: "Open recommendation" }).click();
    expect(await PHASE(page)).toBe("overlay");
    expect(await SELECTED(page)).toBe("truthear-x-crinacle-zero-red");

    // Escape is always a way out.
    await page.keyboard.press("Escape");
    expect(await PHASE(page)).toBe("focused");

    await page.getByRole("button", { name: "Debug" }).click();
    await expect(page.getByText("selected truthear-x-crinacle-zero-red")).toBeVisible();
  });
});
