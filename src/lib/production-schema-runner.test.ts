import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = readFileSync(resolve("scripts/prepare-vercel-database.mjs"), "utf8");
let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "schema-runner-"));
  writeFileSync(join(cwd, "runner.mjs"), script);
  mkdirSync(join(cwd, "prisma"));
  writeFileSync(join(cwd, "prisma/review-status-alignment.sql"), readFileSync("prisma/review-status-alignment.sql"));
  writeFileSync(join(cwd, "prisma/review-status-enum.sql"), readFileSync("prisma/review-status-enum.sql"));
  mkdirSync(join(cwd, "prisma/migrations/20261001090000_add_school_challenge"), { recursive: true });
  writeFileSync(join(cwd, "prisma/migrations/20261001090000_add_school_challenge/migration.sql"), readFileSync("prisma/migrations/20261001090000_add_school_challenge/migration.sql"));
});
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });
function run(environment: string, databaseUrl = "") {
  return spawnSync(process.execPath, [join(cwd, "runner.mjs")], { cwd, encoding: "utf8", env: {
    ...process.env, VERCEL_ENV: environment, DATABASE_URL: databaseUrl,
  } });
}
function fakePrisma(fail: boolean) {
  const path = join(cwd, "node_modules/@prisma/client");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "package.json"), JSON.stringify({ type: "module", main: "index.js" }));
  writeFileSync(join(path, "index.js"), `import {writeFileSync} from 'node:fs';
    export class PrismaClient {
      constructor(options) { writeFileSync('connection.json', JSON.stringify(options)); }
      async $executeRawUnsafe(sql) {writeFileSync('enum.sql', sql);}
      async $transaction(fn, options) {
        writeFileSync('transaction.json', JSON.stringify(options));
        return fn({$executeRawUnsafe: async sql => {
          writeFileSync(sql.includes('SchoolChallenge') ? 'challenge.sql' : 'migration.sql', sql);
          if (${fail}) throw new Error('alignment failed');
        }, review: {count: async args => {writeFileSync('query.json', JSON.stringify(args)); return 3;}}, schoolChallenge: {count: async () => {writeFileSync('challenge-checked', 'true'); return 0;}}});
      }
      async $disconnect() {writeFileSync('disconnected', 'true');}
    }`);
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
    fakePrisma(false);
    const result = run("production", "postgresql://user:pass@localhost/db?pgbouncer=true");
    expect(result.status).toBe(0);
    expect(readFileSync(join(cwd, "migration.sql"), "utf8")).toBe(readFileSync("prisma/review-status-alignment.sql", "utf8"));
    expect(readFileSync(join(cwd, "enum.sql"), "utf8")).toBe(readFileSync("prisma/review-status-enum.sql", "utf8"));
    expect(readFileSync(join(cwd, "challenge.sql"), "utf8")).toBe(readFileSync("prisma/migrations/20261001090000_add_school_challenge/migration.sql", "utf8"));
    expect(readFileSync(join(cwd, "challenge-checked"), "utf8")).toBe("true");
    expect(JSON.parse(readFileSync(join(cwd, "transaction.json"), "utf8"))).toEqual({ maxWait: 15000, timeout: 45000 });
    expect(JSON.parse(readFileSync(join(cwd, "query.json"), "utf8"))).toEqual({ where: { source: "GOOGLE", status: { notIn: ["DRAFT", "GENERATED", "ARCHIVED"] } } });
    const url = new URL(JSON.parse(readFileSync(join(cwd, "connection.json"), "utf8")).datasources.db.url);
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("socket_timeout")).toBe("45");
    expect(url.searchParams.get("connect_timeout")).toBe("15");
    expect(readFileSync(join(cwd, "disconnected"), "utf8")).toBe("true");
    expect(result.stdout).toContain("Prisma query verification completed");
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts["vercel-build"]).toBe("node scripts/prepare-vercel-database.mjs && npm run build");
  });
  it("stops deployment when schema alignment fails instead of continuing to build", () => {
    fakePrisma(true);
    const result = run("production", "postgresql://localhost/test");
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("Prisma query verification completed");
    expect(result.stderr).toContain("alignment failed");
    expect(readFileSync(join(cwd, "disconnected"), "utf8")).toBe("true");
  });
});
