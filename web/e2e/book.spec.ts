import { expect, test, type Page } from "@playwright/test";

/**
 * The edition: the cinematic book, and the real `/match` page it lands on.
 *
 * These run under the default harness, which usually means SwiftShader — so
 * they assert behaviour (what plays, what it lands on, what it says), not how
 * it looks. Appearance is reviewed from GPU captures (`book-capture.spec.ts`);
 * the ending's geometry is asserted exactly in `src/components/book/book.test.ts`.
 */

/** Where Skip lands: the end of the film, on the page. */
const END = "16.550";

async function open(page: Page) {
  await page.goto("/book-studio");
  const main = page.locator("[data-edition]");
  await expect(main).toHaveAttribute("data-mode", /film|page/, { timeout: 60_000 });
  return main;
}

const seek = (page: Page, t: number) =>
  page.evaluate((s) => (window as unknown as { __bookSeek: (n: number) => void }).__bookSeek(s), t);

/** The real page's product photograph: its drawn image box, on screen. */
async function cardImage(page: Page) {
  return page
    .locator("[data-layer='match'] [data-art='truthear-nova'] img")
    .evaluate((img: HTMLImageElement) => {
      const box = img.getBoundingClientRect();
      const scale = box.width / img.offsetWidth;
      const style = getComputedStyle(img);
      const pad = (k: string) => parseFloat(style.getPropertyValue(k)) * scale;
      const cw = box.width - pad("padding-left") - pad("padding-right");
      const ch = box.height - pad("padding-top") - pad("padding-bottom");
      const fit = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * fit;
      const h = img.naturalHeight * fit;
      return {
        x: box.left + pad("padding-left") + (cw - w) / 2,
        y: box.top + pad("padding-top") + (ch - h) / 2,
        w,
        h,
      };
    });
}

async function inView(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const { height } = page.viewportSize()!;
  return box.y >= -1 && box.y + box.height <= height + 1;
}

test("the film plays, and skipping lands on the real page at the Sound DNA", async ({ page }) => {
  test.setTimeout(120_000);
  const main = await open(page);
  await expect(main).toHaveAttribute("data-mode", "film");
  await expect(page.locator("[data-layer='film'] canvas")).toHaveCount(1);

  // It is actually playing, not parked on a frame.
  await expect
    .poll(async () => Number(await main.getAttribute("data-time")), { timeout: 20_000 })
    .toBeGreaterThan(0.3);

  await page.keyboard.press("Escape");
  await expect(main).toHaveAttribute("data-time", END);
  await expect(main).toHaveAttribute("data-landed", "true");

  // The page is /match's own, and it now opens on the listener's Sound Card:
  // finished, at rest, filling the screen.
  const card = page.locator("[data-layer='match'] [data-section='sound-card']");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-card-done", "true", { timeout: 20_000 });
  await expect.poll(() => inView(page, "[data-card-stage]")).toBe(true);
  await expect(page.locator("text=/demo · sample listener/i >> visible=true").first()).toBeVisible();

  // Once the page has taken over, the film draws nothing, and the page is the
  // viewer's to scroll.
  await expect(page.locator("[data-layer='film']")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight * 2,
  );
  expect(scrollable).toBe(true);
});

test("the camera pulls back onto the real product card, registered", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  // Let the page underneath mount and settle where the card is composed.
  await page.locator("[data-layer='match'] [data-art='truthear-nova'] img").waitFor({ state: "attached" });
  await page.waitForTimeout(2000);

  // The pullback's first frame: the page's own photograph sits exactly under
  // the overlay's. Polled, because the page keeps measuring itself while its
  // own entrance animations finish.
  await seek(page, 10.85);
  const product = page.locator("[data-layer='film'] [data-product='truthear-nova']");
  await expect
    .poll(
      async () => {
        const o = (await product.boundingBox())!;
        const c = await cardImage(page);
        const diff = Math.max(Math.abs(c.x - o.x), Math.abs(c.y - o.y), Math.abs(c.w - o.width));
        if (process.env.BOOK_DEBUG) console.log(JSON.stringify({ o, c, diff }));
        return diff;
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(1.5);
  const overlay = (await product.boundingBox())!;
  // At the macro, the earphones fill the frame.
  expect(overlay.width).toBeGreaterThan(page.viewportSize()!.width * 0.9);

  // At rest it is the product card on /match: the overlay is gone, the card's
  // photograph is on screen at its own size, beside the recommendation.
  await seek(page, 12.4);
  await page.waitForTimeout(500);
  await expect(page.locator("[data-layer='film'] [data-product]")).toHaveCount(0);
  const rest = await cardImage(page);
  expect(rest.w).toBeLessThan(overlay.width * 0.6);
  expect(rest.y).toBeGreaterThan(0);
  const match = page.locator("[data-layer='match']");
  await expect(match.getByText("Your strongest match")).toBeVisible();
  await expect(match.getByText(/Photograph:/).first()).toBeVisible();
});

test("the sample page never changes the viewer's account", async ({ page }) => {
  test.setTimeout(120_000);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(`${r.method()} ${r.url()}`);
  });
  const main = await open(page);
  await page.keyboard.press("Escape");
  await expect(main).toHaveAttribute("data-time", END);
  const match = page.locator("[data-layer='match']");
  // No way to delete an account from someone else's page.
  await expect(match.getByRole("button", { name: /Delete my data/ })).toHaveCount(0);
  // Saving is kept on the page.
  const save = match.getByRole("button", { name: "Save this" }).first();
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(match.getByRole("button", { pressed: true }).first()).toBeVisible();
  expect(writes).toEqual([]);
});

test("replay goes back to the film", async ({ page }) => {
  test.setTimeout(120_000);
  const main = await open(page);
  await page.keyboard.press("Escape");
  await expect(main).toHaveAttribute("data-time", END);
  await page.getByRole("button", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Replay" }).click();
  // Back into the film: the clock restarted (well short of the end) and the
  // film is drawn again. Under load the first reading can arrive seconds in.
  await expect.poll(async () => Number(await main.getAttribute("data-time"))).toBeLessThan(Number(END) - 10);
  await expect(page.locator("[data-layer='film']")).toHaveCSS("visibility", "visible");
});

test("every photograph's source is one click away", async ({ page }) => {
  test.setTimeout(120_000);
  const main = await open(page);
  await page.keyboard.press("Escape");
  await expect(main).toHaveAttribute("data-time", END);
  await page.getByRole("button", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Photographs & sources" }).click();
  const dialog = page.getByRole("dialog", { name: "Photographs and sources" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Source page" })).toHaveCount(7);
  await expect(dialog.getByText(/Manufacturer: Truthear/).first()).toBeVisible();
  await expect(dialog.getByText(/permission for reuse\s+has not been obtained/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("reduced motion goes straight to the page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const main = await open(page);
  await expect(main).toHaveAttribute("data-mode", "page");
  await expect(page.locator("[data-layer='film'] canvas")).toHaveCount(0);
  // The card is shown at rest, not engraved in front of someone who asked for less motion.
  await expect(page.locator("[data-section='sound-card']")).toHaveAttribute("data-card-done", "true", {
    timeout: 20_000,
  });
});

test("without WebGL the page is shown, and says why", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error -- deliberately narrowing the overload for this test
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  const main = await open(page);
  await expect(main).toHaveAttribute("data-mode", "page");
  await expect(page.locator("[data-layer='film'] canvas")).toHaveCount(0);
  // The card is still the card: its engraved proof, drawn flat.
  await expect(page.locator("[data-card-proof] canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("The 3D edition could not play here, so the page is shown directly."),
  ).toBeVisible();
});

test("on a phone the page it lands on fits the screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "portrait layout");
  test.setTimeout(120_000);
  const main = await open(page);
  await page.keyboard.press("Escape").catch(() => undefined);
  if ((await main.getAttribute("data-time")) !== END) {
    await page.getByRole("button", { name: /Skip/ }).click();
  }
  await expect(main).toHaveAttribute("data-time", END);
  await expect(page.locator("[data-section='sound-card']")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
