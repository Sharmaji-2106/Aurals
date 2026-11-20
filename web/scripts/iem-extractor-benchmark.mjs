// Browser parsing benchmark against the same cached, public HTML as Python parsers.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(process.cwd(), "..");
const url = "https://headphones.com/pages/hps-iem-ranking";
const sha = createHash("sha256").update(url).digest("hex");
const body = readFileSync(resolve(root, "data/iem/raw/headphones.com", `${sha}.bin`), "utf8");
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage();
await page.route("**/*", (route) => route.abort()); // No external requests from cached HTML.
const start = performance.now();
await page.setContent(body, { waitUntil: "domcontentloaded" });
const imgs = await page.locator("img").count();
const elapsed = performance.now() - start;
await browser.close();
const result = {
  name: "Playwright system Chrome",
  input_bytes: Buffer.byteLength(body),
  img_tags: imgs,
  elapsed_ms: Math.round(elapsed),
  external_requests: 0,
  note: "Browser parsed cached page; model table still unavailable in static content",
};
const target = resolve(root, "data/iem/reports/playwright-extractor-probe.json");
writeFileSync(target, JSON.stringify(result, null, 2), { flag: "wx" });
console.log(result);
