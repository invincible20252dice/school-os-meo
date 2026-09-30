import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/prepare-vercel-database.mjs");
let cwd: string;
beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), "schema-runner-")); });
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });
function run(environment: string, databaseUrl = "") {
  return spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: {
    ...process.env, VERCEL_ENV: environment, DATABASE_URL: databaseUrl,
  } });
}
function fakePrisma(exitCode: number) {
  const path = join(cwd, "node_modules/prisma/build");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "index.js"), `require('fs').writeFileSync('arguments.json', JSON.stringify(process.argv.slice(2))); process.exit(${exitCode});`);
}

describe("production deployment schema gate", () => {
  it.each(["", "preview", "development"])("never modifies the database during %s builds", environment => {
    expect(run(environment).status).toBe(0);
  });
  it("fails closed when production has no database configuration", () => {
    const result = run("production");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production DATABASE_URL is required");
  });
  it("executes only the targeted migration before allowing a production build", () => {
    fakePrisma(0);
    const result = run("production", "test-connection");
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "arguments.json"), "utf8"))).toEqual([
      "db", "execute", "--file", "prisma/review-status-alignment.sql", "--schema", "prisma/schema.prisma",
    ]);
    expect(result.stdout).toContain("schema alignment completed");
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts["vercel-build"]).toBe("node scripts/prepare-vercel-database.mjs && npm run build");
  });
  it("stops deployment when schema alignment fails instead of continuing to build", () => {
    fakePrisma(1);
    const result = run("production", "test-connection");
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("schema alignment completed");
  });
});
