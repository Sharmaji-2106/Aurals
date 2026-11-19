// Regenerate src/lib/api/schema.d.ts from the running API (cross-platform).
import { execFileSync } from "node:child_process";

const base = process.env.AURALIS_API_URL ?? "http://127.0.0.1:8000";
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["openapi-typescript", `${base}/api/openapi.json`, "-o", "src/lib/api/schema.d.ts"],
  { stdio: "inherit", shell: process.platform === "win32" },
);
