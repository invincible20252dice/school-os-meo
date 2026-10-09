import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const requiredFiles = [
  "src/app/(dashboard)/dashboard/aio/page.tsx", "src/lib/aio-cron.ts",
  "src/app/api/cron/analyze-aio/route.ts", "prisma/schema.prisma",
  "src/components/dashboard/navigation.ts", "src/lib/supabase-access.ts",
  "src/app/api/dashboard/challenge/route.ts",
];
export function validOrigin(remote) {
  return /^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)invincible20252dice\/school-os-meo(?:\.git)?\/?$/.test(remote.trim());
}
export function preflight(cwd = process.cwd(), log = console.log) {
  const git = (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const origin = git("remote", "get-url", "origin");
  if (!validOrigin(origin)) throw new Error("Wrong origin: only invincible20252dice/school-os-meo is allowed.");
  if (realpathSync(git("rev-parse", "--show-toplevel")) !== realpathSync(cwd)) throw new Error("Run from the repository root.");
  const pkg = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  if (pkg.name !== "meo-aio-school-saas") throw new Error("Wrong package name.");
  if (!pkg.dependencies?.next || !pkg.dependencies?.["@prisma/client"]) throw new Error("Next.js/Prisma dependencies are missing.");
  for (const file of requiredFiles) if (!existsSync(resolve(cwd, file))) throw new Error("Missing required file: " + file);
  const schema = readFileSync(resolve(cwd, "prisma/schema.prisma"), "utf8");
  if (!/model\s+School\s*\{/.test(schema) || !/\bschoolId\b/.test(schema)) throw new Error("School tenancy schema missing.");
  log("PASS origin: " + origin);
  log("Repository: " + realpathSync(cwd));
  log("PASS package: " + pkg.name);
  log("Branch: " + (git("branch", "--show-current") || "(detached HEAD)"));
  log("Git status:\n" + (git("status", "--short", "--branch") || "(clean)"));
  log("PASS required School OS sources and Prisma schema");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { preflight(); } catch (error) { console.error("FAIL preflight: " + error.message); process.exitCode = 1; }
}
