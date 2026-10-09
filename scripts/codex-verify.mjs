import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { preflight } from "./codex-preflight.mjs";
import { migrationCheck } from "./codex-migration-check.mjs";
import { testEnvironment } from "./codex-test-env.mjs";

let nextEnvBefore;
try {
  preflight();
  migrationCheck();
  nextEnvBefore = readFileSync("next-env.d.ts", "utf8");
  const env = testEnvironment();
  env.CODEX_STRICT = process.argv.includes("--strict") ? "1" : "0";
  const steps = ["test:tooling", "prisma:generate", "typecheck", "lint", "test:coverage", "build", "test:e2e"];
  for (const step of steps) {
    console.log("\nVERIFY " + step);
    const result = spawnSync("npm", ["run", step], {
      env: { ...env, NODE_ENV: step.startsWith("test:") ? "test" : "production" }, stdio: "inherit",
    });
    if (result.error || result.status !== 0) throw new Error(step + " failed (" + (result.status ?? result.error?.code) + ")");
  }
  console.log("\nPASS isolated checks. Live provider/DB verification is a separate gate; see docs/testing.md.");
} catch (error) { console.error("FAIL codex:verify: " + error.message); process.exitCode = 1; }
finally {
  if (nextEnvBefore !== undefined) {
    const current = readFileSync("next-env.d.ts", "utf8");
    const generated = nextEnvBefore.replace("./.next/types/routes.d.ts", "./.next-codex/types/routes.d.ts");
    if (current === generated && current !== nextEnvBefore) writeFileSync("next-env.d.ts", nextEnvBefore);
    else if (current !== nextEnvBefore) {
      console.error("FAIL next-env.d.ts changed unexpectedly; preserve and inspect it manually.");
      process.exitCode = 1;
    }
  }
}
