import { expect, test } from "@playwright/test";

/**
 * The records on the analysis page stay put while songs are measured, and the
 * listening session plays a song and part the listener chose (deleted at the end).
 *
 *     OWN_CAPTURE=<dir> npx playwright test e2e/own-song-capture.spec.ts --config=playwright.gpu.config.ts
 */
test.skip(!process.env.OWN_CAPTURE, "own-song captures run on request");

const SONGS = [
  "https://www.youtube.com/watch?v=60ItHLz5WEA",
  "https://www.youtube.com/watch?v=OPf0YbXqDm0",
  "https://www.youtube.com/watch?v=CevxZvSJLk8",
  "https://www.youtube.com/watch?v=RgKAFK5djSk",
  "https://www.youtube.com/watch?v=09R8_2nJtjg",
  "https://www.youtube.com/watch?v=YQHsXMglC9A",
];

test("records hold still, and your own song plays", async ({ page }) => {
  test.setTimeout(600_000);
  const out = process.env.OWN_CAPTURE;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/start");
  await page.getByLabel("Your name").fill("Own Song");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(/\/music$/);
  const created = await page.request.post("/api/music/submissions", {
    data: { urls: SONGS },
    headers: { "x-auralis-client": "web" },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/analysis/${id}`);

  // Sample every record's vertical position while it is measured.
  const drift: number[] = [];
  const tops = new Map<number, number[]>();
  for (let i = 0; i < 200; i++) {
    const done = await page.request.get(`/api/music/submissions/${id}`).then((r) => r.json());
    const rects = await page
      .locator(".group\\/disc")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top + window.scrollY));
    rects.forEach((t, k) => tops.set(k, [...(tops.get(k) ?? []), t]));
    if (i === 6) await page.screenshot({ path: `${out}/1-analysis.png` });
    if ((done as { status: string }).status === "completed") break;
    await page.waitForTimeout(250);
  }
  for (const series of tops.values()) {
    // Ignore the first samples of each record, while it fades in.
    const settled = series.slice(4);
    if (settled.length > 3) drift.push(Math.max(...settled) - Math.min(...settled));
  }
  console.log(
    "record vertical drift (px):",
    drift.map((d) => d.toFixed(1)).join(", ") || "no records sampled",
  );

  await expect
    .poll(async () => (await page.request.get("/api/music/profile")).status(), {
      timeout: 300_000,
      intervals: [3000],
    })
    .toBe(200);

  // Your own song, any part of it.
  await page.goto("/tune");
  await expect(page.locator("[data-tuning-stage='setup']")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Play your own song/ }).click();
  const studio = page.getByRole("dialog", { name: "Choose your own music" });
  await expect(studio).toBeVisible();
  await page.screenshot({ path: `${out}/2-studio-list.png` });
  await studio.locator("ul button").first().click();
  await expect(studio.getByRole("button", { name: "Use this part" })).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/3-studio-waveform.png` });
  // Drag the window toward the start of the song.
  const track = studio.getByLabel("Drag the window to choose the part");
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/4-studio-moved.png` });
  await studio.getByRole("button", { name: "Use this part" }).click();
  await expect(page.getByText(/Your choice · /)).toBeVisible();
  await page.screenshot({ path: `${out}/5-setup-own.png` });
  await page.getByRole("button", { name: /wearing headphones/ }).click();
  await expect(page.locator("[data-tuning-stage='shapes']")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/6-shapes-own.png` });

  await page.goto("/match");
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/$/, { timeout: 30_000 });
  expect(errors, errors.join(" | ")).toHaveLength(0);
});
