import { expect, test } from "@playwright/test";

/**
 * The listening session, end to end, for a throwaway listener (deleted at the end):
 * real songs are analysed, the clip is cut from the most-watched one, and the shape
 * picker, the eight-pair duel and the result are played through and captured.
 *
 *     LISTEN_CAPTURE=<dir> npx playwright test e2e/listening-capture.spec.ts --config=playwright.gpu.config.ts
 */
test.skip(!process.env.LISTEN_CAPTURE, "listening captures run on request");

const SONGS = [
  "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  "https://www.youtube.com/watch?v=hTWKbfoikeg",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
  "https://www.youtube.com/watch?v=JGwWNGJdvx8",
];

test("the listening session", async ({ page }) => {
  test.setTimeout(600_000);
  const out = process.env.LISTEN_CAPTURE;
  const shot = async (name: string, wait = 1200) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/start");
  await page.getByLabel("Your name").fill("Listening Test");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(/\/music$/);
  const created = await page.request.post("/api/music/submissions", {
    data: { urls: SONGS },
    headers: { "x-auralis-client": "web" },
  });
  expect(created.ok()).toBeTruthy();
  // Wait for the analysis to finish.
  await expect
    .poll(async () => (await page.request.get("/api/music/profile")).status(), {
      timeout: 300_000,
      intervals: [3000],
    })
    .toBe(200);

  await page.goto("/tune");
  await expect(page.locator("[data-tuning-stage='setup']")).toBeVisible({ timeout: 30_000 });
  await shot("1-setup-loading", 400);
  await expect(page.getByText(/its strongest 20 seconds|No playlist yet/)).toBeVisible({ timeout: 180_000 });
  await shot("2-setup-ready");
  // The device: popular picks first, then a search, then how it already sounds.
  await expect(page.locator("[data-device-picker]").getByText("Popular")).toBeVisible({ timeout: 15_000 });
  await shot("2b-device-popular", 600);
  await page.getByLabel("Search your earphones or headphones").fill("galaxy buds2 pro");
  await page
    .getByRole("button", { name: /Samsung Galaxy Buds2 Pro/ })
    .first()
    .click();
  await expect(page.getByText(/AURALS adds that back/)).toBeVisible({ timeout: 15_000 });
  await shot("2c-device-chosen", 600);
  await page.getByRole("button", { name: /wearing headphones/ }).click();
  await expect(page.locator("[data-tuning-stage='shapes']")).toBeVisible({ timeout: 30_000 });
  await shot("3-shapes");
  await page.getByRole("radio", { name: /V-shaped/ }).click();
  await shot("4-shapes-v", 900);
  await page.getByRole("radio", { name: /Warm/ }).click();
  await page.getByRole("button", { name: /is closest/ }).click();
  await expect(page.locator("[data-tuning-stage='duel']")).toBeVisible();
  await shot("5-duel");
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Listen to B" }).click();
    if (i === 1) await shot("6-duel-b-playing", 700);
    await page.getByRole("button", { name: i % 3 === 0 ? "A is better" : "B is better" }).click();
    await page.waitForTimeout(650);
  }
  await expect(page.locator("[data-tuning-stage='result']")).toBeVisible();
  await expect(page.getByText(/count fully|carry a little more weight|now shapes your sound/)).toBeVisible({
    timeout: 30_000,
  });
  await shot("7-result");
  await page.getByRole("button", { name: /Continue to a few questions/ }).click();
  await shot("8-questions");

  // The questions' examples come from this listener's own songs.
  await expect
    .poll(
      async () =>
        ((await (await page.request.get("/api/tuning/examples")).json()) as { status: string }).status,
      {
        timeout: 240_000,
        intervals: [3000],
      },
    )
    .toBe("ready");
  const examples = (await (await page.request.get("/api/tuning/examples")).json()) as {
    items: { question: string; title: string; start_s: number }[];
  };
  console.log("examples:", examples.items.map((e) => `${e.question}: ${e.title} @${e.start_s}s`).join(" | "));
  await page.reload();
  await expect(page.getByText(/where the bass hits hardest/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play the example" }).click();
  await shot("9-question-clip", 1500);
  await page.getByRole("button", { name: "Fuller low end" }).click();
  await shot("9b-question-clip-full", 1200);
  // Through the questions to the practical page, in rupees.
  const { questions } = (await (await page.request.get("/api/questionnaire")).json()) as {
    questions: { prompt: string; kind: "scale" | "choice" }[];
  };
  for (const question of questions) {
    const group = page.getByRole("radiogroup", { name: question.prompt });
    await group.getByRole("radio").nth(1).click();
    if (question.kind === "scale") await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText("practical");
  await shot("10-practical", 800);
  await page.getByRole("button", { name: /₹5k–10k/ }).click();
  await shot("10b-practical-band", 800);

  await page.goto("/match");
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(/\/$/);
  console.log("page errors:", errors.length ? errors.join(" | ") : "none");
});
