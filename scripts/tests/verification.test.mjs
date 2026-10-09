import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { preflight, requiredFiles, validOrigin } from "../codex-preflight.mjs";
import { unsafeSql, schemaRisks, migrationCheck } from "../codex-migration-check.mjs";
import { testEnvironment } from "../codex-test-env.mjs";

test("origin identity rejects similar names, wrong owners and URL credentials", () => {
  for (const origin of ["https://github.com/invincible20252dice/school-os-meo.git", "git@github.com:invincible20252dice/school-os-meo.git"])
    assert.equal(validOrigin(origin), true);
  for (const origin of ["https://github.com/invincible20252dice/ai-tutor.git", "https://github.com/other/school-os-meo.git", "https://github.com.evil/invincible20252dice/school-os-meo.git", "https://secret@github.com/invincible20252dice/school-os-meo.git"])
    assert.equal(validOrigin(origin), false);
});
test("preflight and migration guard inspect real git changes including untracked SQL", () => {
  const cwd = mkdtempSync(join(tmpdir(), "school-os-guard-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } });
  const put = (file, content) => { mkdirSync(dirname(join(cwd, file)), { recursive: true }); writeFileSync(join(cwd, file), content); };
  const oldBase = process.env.CODEX_VERIFY_BASE;
  delete process.env.CODEX_VERIFY_BASE;
  try {
    git("init", "-b", "main");
    git("remote", "add", "origin", "https://github.com/invincible20252dice/school-os-meo.git");
    put("package.json", JSON.stringify({ name: "meo-aio-school-saas", dependencies: { next: "15", "@prisma/client": "6" } }));
    for (const file of requiredFiles) put(file, file.endsWith(".prisma") ? "model School {\n id String\n schoolId String\n}\n" : "// fixture\n");
    put("prisma/migrations/initial/migration.sql", "CREATE TABLE sample (id TEXT);");
    git("add", ".");
    git("commit", "-m", "fixture");
    assert.doesNotThrow(() => preflight(cwd, () => {}));
    assert.doesNotThrow(() => migrationCheck(cwd, () => {}));
    put("prisma/migrations/new/migration.sql", "DROP TABLE sample;");
    assert.throws(() => migrationCheck(cwd, () => {}), /DROP/);
    put("prisma/migrations/new/migration.sql", "CREATE TABLE added (id TEXT);");
    assert.doesNotThrow(() => migrationCheck(cwd, () => {}));
    put("prisma/migrations/initial/migration.sql", "CREATE TABLE renamed (id TEXT);");
    assert.throws(() => migrationCheck(cwd, () => {}), /existing migration modified/);
    git("remote", "set-url", "origin", "https://github.com/invincible20252dice/ai-tutor.git");
    assert.throws(() => preflight(cwd, () => {}), /Wrong origin/);
    git("remote", "set-url", "origin", "git@github.com:invincible20252dice/school-os-meo.git");
    put("package.json", '{"name":"other"}');
    assert.throws(() => preflight(cwd, () => {}), /Wrong package/);
  } finally {
    if (oldBase === undefined) delete process.env.CODEX_VERIFY_BASE; else process.env.CODEX_VERIFY_BASE = oldBase;
    rmSync(cwd, { recursive: true, force: true });
  }
});
test("SQL guard catches destructive statements, obfuscating comments and dynamic SQL", () => {
  for (const sql of ["DROP TABLE t", "ALTER TABLE t DROP COLUMN c", "TRUNCATE t", "DELETE FROM t", "DROP/*x*/ TABLE t", "DO $$ BEGIN EXECUTE 'DROP TABLE t'; END $$", "UPDATE t SET c=1", "ALTER TABLE t ALTER COLUMN c TYPE integer"])
    assert.ok(unsafeSql(sql).length, sql);
  assert.deepEqual(unsafeSql("CREATE TABLE t (id TEXT); ALTER TABLE t ADD COLUMN note TEXT;"), []);
});
test("Prisma removed models and field type changes are rejected", () => {
  const original = "model School {\n id String\n name String\n}";
  assert.deepEqual(schemaRisks(original, original.replace("name String", "name String\n extra String?")), []);
  assert.ok(schemaRisks(original, original.replace("name String", "name Int")).length);
  assert.ok(schemaRisks(original, "model Other { id String }").length);
});
test("verification never inherits application credentials or dotenv values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "school-os-env-"));
  try {
    writeFileSync(join(cwd, ".env.local"), "DATABASE_URL=not-a-test-db\nPRIVATE_PROVIDER_TOKEN=secret\n");
    const env = testEnvironment({ PATH: "/bin", HOME: "/tmp", OPENAI_API_KEY: "secret", CUSTOM_SECRET: "secret" }, cwd);
    assert.equal(env.OPENAI_API_KEY, "");
    assert.equal(env.CUSTOM_SECRET, "");
    assert.equal(env.PRIVATE_PROVIDER_TOKEN, "");
    assert.match(env.DATABASE_URL, /127\.0\.0\.1:1\/school_os_verify/);
    assert.match(env.NODE_OPTIONS, /codex-network-guard/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("verification network guard blocks external fetch before sending a request", () => {
  const output = execFileSync(process.execPath, ["--require", "./scripts/codex-network-guard.cjs", "-e", "try { fetch('https://example.com'); process.exit(2); } catch { console.log('blocked'); }"], { encoding: "utf8" });
  assert.equal(output.trim(), "blocked");
});
test("Vercel builds never run database preparation or migrations", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.buildCommand, "npm run build");
  assert.deepEqual(vercel.git?.deploymentEnabled, { "codex/aio-linux-verification": false, "codex/aio-phase2": false, "codex/aio-phase3": false, "codex/aio-places-verification": false });
  assert.equal(pkg.scripts["vercel-build"], "npm run build");
  assert.equal(pkg.scripts.build, "npm run prisma:generate && next build");
  assert.equal(pkg.scripts["prisma:generate"], "prisma generate");
  for (const hook of ["prebuild", "postbuild", "prevercel-build", "postvercel-build", "preinstall", "install"])
    assert.equal(pkg.scripts[hook], undefined);
  assert.equal(pkg.scripts.postinstall, "prisma generate");
});

test("Linux CI prepares Prisma engines before isolated verification without app install hooks", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  const install = workflow.indexOf("run: npm ci --ignore-scripts");
  const engines = workflow.indexOf("run: node node_modules/@prisma/engines/scripts/postinstall.js");
  const verify = workflow.indexOf("run: npm run codex:verify");
  assert.ok(install >= 0 && engines > install && verify > engines);
  assert.doesNotMatch(workflow, /secrets\.|prisma (?:migrate|db)|supabase db|vercel --prod/);
});

test("feature CI reviews the full unmerged schema while main protects the previous schema", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.ok(workflow.includes("github.event.pull_request.base.sha || (github.ref == 'refs/heads/main' && github.event.before) || ''"));
});
