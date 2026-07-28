const requiredProductionEnvKeys = [
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
];

const recommendedProductionEnvKeys = [
  "GBP_API_REVIEWS_URL",
  "GBP_API_ACCESS_TOKEN",
  "GBP_METRICS_API_URL",
  "GBP_LOCAL_POSTS_API_URL",
  "NGROK_URL",
  "INSTAGRAM_REDIRECT_URI",
];

const strict = process.argv.includes("--strict");
const hasValue = (key) =>
  typeof process.env[key] === "string" && process.env[key].trim().length > 0;

const missing = requiredProductionEnvKeys.filter((key) => !hasValue(key));
const warnings = recommendedProductionEnvKeys.filter((key) => !hasValue(key));

if (warnings.length > 0) {
  console.warn(
    `Recommended production env keys are not configured: ${warnings.join(", ")}`,
  );
}

if (missing.length > 0) {
  console.error(
    `Missing required production env keys: ${missing.join(", ")}`,
  );

  if (strict) {
    process.exit(1);
  }
} else {
  console.info("Production environment check passed.");
}
