import { spawnSync } from "node:child_process";

// Preview builds must never migrate a shared production database.
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) throw new Error("Production DATABASE_URL is required for schema alignment");
  const result = spawnSync(process.execPath, [
    "node_modules/prisma/build/index.js", "db", "execute",
    "--file", "prisma/review-status-alignment.sql", "--schema", "prisma/schema.prisma",
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log("Review.status schema alignment completed.");
}
