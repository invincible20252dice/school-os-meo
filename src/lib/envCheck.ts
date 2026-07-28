export type EnvMap = Record<string, string | undefined>;

export type EnvValidationResult = {
  ok: boolean;
  missing: string[];
  present: string[];
  warnings: string[];
};

export const requiredProductionEnvKeys = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_DEFAULT_TO_ID",
  "META_APP_ID",
  "META_APP_SECRET",
  "CRON_SECRET",
  "GBP_WEBHOOK_SECRET",
  "ANALYTICS_API_SECRET",
] as const;

export const recommendedProductionEnvKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "GBP_API_REVIEWS_URL",
  "GBP_API_ACCESS_TOKEN",
  "GBP_METRICS_API_URL",
  "GBP_LOCAL_POSTS_API_URL",
  "NGROK_URL",
  "INSTAGRAM_REDIRECT_URI",
] as const;

export type RequiredProductionEnvKey =
  (typeof requiredProductionEnvKeys)[number];

export function hasEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateEnv(
  env: EnvMap = process.env,
  requiredKeys: readonly string[] = requiredProductionEnvKeys,
  recommendedKeys: readonly string[] = recommendedProductionEnvKeys,
): EnvValidationResult {
  const missing = requiredKeys.filter((key) => !hasEnvValue(env[key]));
  const present = requiredKeys.filter((key) => hasEnvValue(env[key]));
  const warnings = recommendedKeys
    .filter((key) => !hasEnvValue(env[key]))
    .map((key) => `${key} is not configured.`);

  return {
    ok: missing.length === 0,
    missing,
    present,
    warnings,
  };
}

export function formatEnvCheckMessage(result: EnvValidationResult): string {
  const lines = result.ok
    ? ["Production environment check passed."]
    : [
        "Production environment check failed.",
        `Missing required keys: ${result.missing.join(", ")}`,
      ];

  if (result.warnings.length > 0) {
    lines.push(`Recommended keys: ${result.warnings.join(" ")}`);
  }

  return lines.join("\n");
}

export function assertProductionEnv(
  env: EnvMap = process.env,
  logger: Pick<Console, "error" | "warn" | "info"> = console,
): EnvValidationResult {
  const result = validateEnv(env);
  const message = formatEnvCheckMessage(result);

  if (result.warnings.length > 0) {
    logger.warn(result.warnings.join("\n"));
  }

  if (!result.ok) {
    logger.error(message);
    throw new Error(message);
  }

  logger.info(message);
  return result;
}
