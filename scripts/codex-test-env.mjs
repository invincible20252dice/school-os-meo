import { readdirSync, readFileSync } from "node:fs";

// Clear application/provider credentials, including keys that Next would load from .env files.
// Keep only OS/toolchain values; never import production environment values into verification.
export function testEnvironment(source = process.env, cwd = process.cwd()) {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "SystemRoot",
    "CI", "TERM", "LANG", "LC_ALL", "CODEX_VERIFY_BASE", "PLAYWRIGHT_BROWSERS_PATH"];
  const env = Object.fromEntries(allowed.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
  for (const [key] of Object.entries(source)) if (!allowed.includes(key)) env[key] = "";
  for (const file of readdirSync(cwd).filter(name => /^\.env(?:\.|$)/.test(name))) {
    for (const match of readFileSync(cwd + "/" + file, "utf8").matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/gm)) env[match[1]] = "";
  }
  return { ...env, SCHOOL_OS_VERIFY: "1", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: "postgresql://test:test@127.0.0.1:1/school_os_verify?connect_timeout=1",
    DIRECT_URL: "postgresql://test:test@127.0.0.1:1/school_os_verify?connect_timeout=1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "school-os-test-only",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:4317",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:4317",
    SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", CRON_SECRET: "test-only-cron-secret",
    NODE_ENV: "production",
    NODE_OPTIONS: "--require=" + JSON.stringify(cwd + "/scripts/codex-network-guard.cjs"),
  };
}
