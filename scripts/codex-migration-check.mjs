import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { preflight } from "./codex-preflight.mjs";

export function unsafeSql(sql) {
  // Conservative static gate: do not remove string contents (dynamic SQL can be destructive).
  const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
  const rules = [
    [/\bDROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b/i, "DROP"],
    [/\bTRUNCATE\b/i, "TRUNCATE"],
    [/\bDELETE\s+FROM\b/i, "DELETE"],
    [/\bALTER\b[\s\S]*?\b(?:DROP|RENAME|TYPE)\b/i, "breaking ALTER"],
    [/\bUPDATE\s+(?:"[^"]+"|[\w.]+)\s+SET\b/i, "data backfill needs review"],
    [/\b(?:EXECUTE|EXEC|PREPARE)\b/i, "dynamic SQL needs review"],
  ];
  return rules.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label);
}
function schemaFields(source) {
  const models = new Map();
  for (const match of source.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g)) {
    const fields = new Map();
    for (const line of match[2].split("\n")) {
      const m = line.trim().match(/^(\w+)\s+([\w[\]?]+)/);
      if (m) fields.set(m[1], m[2]);
    }
    models.set(match[1], fields);
  }
  return models;
}
export function schemaRisks(before, after) {
  const oldModels = schemaFields(before), newModels = schemaFields(after), risks = [];
  for (const [model, fields] of oldModels) {
    if (!newModels.has(model)) { risks.push("removed model " + model); continue; }
    for (const [name, type] of fields) {
      if (newModels.get(model).get(name) !== type) risks.push("removed/type-changed field " + model + "." + name);
    }
  }
  return risks;
}
export function migrationCheck(cwd = process.cwd(), log = console.log) {
  const git = (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const requested = process.env.CODEX_VERIFY_BASE;
  let base;
  if (requested && !/^0+$/.test(requested)) base = git("rev-parse", "--verify", requested + "^{commit}");
  else {
    try { base = git("merge-base", "HEAD", "origin/main"); }
    catch { base = git("rev-parse", "HEAD"); }
  }
  const changed = [...new Set([
    ...git("diff", "--name-only", "-z", base).split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ].filter(Boolean))];
  const problems = [];
  for (const file of changed) {
    if (!/^(prisma|supabase)\//.test(file) || !/\.(sql|prisma)$/.test(file)) continue;
    const full = resolve(cwd, file);
    let before = "";
    try { before = git("show", base + ":" + file); } catch { /* New file. */ }
    if (!existsSync(full)) { problems.push(file + ": removed schema/migration"); continue; }
    const after = readFileSync(full, "utf8");
    if (file.includes("/migrations/") && before && before !== after.trim()) problems.push(file + ": existing migration modified");
    if (file.endsWith(".sql")) problems.push(...unsafeSql(after).map(reason => file + ": " + reason));
    else problems.push(...schemaRisks(before, after).map(reason => file + ": " + reason));
  }
  if (problems.length) throw new Error(problems.join("\n"));
  log("PASS migration static safety (base " + base.slice(0, 12) + "); no SQL executed");
  log("Manual review still required for constraints, locks, enums, dynamic SQL and data backfills.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { preflight(); migrationCheck(); } catch (error) { console.error("FAIL migration safety: " + error.message); process.exitCode = 1; }
}
