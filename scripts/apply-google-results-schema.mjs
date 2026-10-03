import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

// Explicit one-off deployment command, never part of the normal build.
export async function applyGoogleResultsSchema(prisma) {
  const sql = readFileSync(new URL("../prisma/migrations/20261003030000_add_google_leads/migration.sql", import.meta.url), "utf8");
  const columns = ["id", "schoolId", "source", "channel", "grade", "status", "occurredAt", "meetingAt", "closedAt", "deletedAt", "idempotencyKey", "version", "createdAt", "updatedAt"];
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(73501820261003)");
    const existing = await tx.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('School','GbpMetric','GoogleLead')");
    const has = (table, column) => existing.some(row => row.table_name === table && row.column_name === column);
    if (!has("School", "id") || !has("GbpMetric", "id")) throw new Error("Required base tables are missing; stopped without changes.");
    const leadExists = existing.some(row => row.table_name === "GoogleLead");
    const metadata = ["performanceFetchedAt", "performanceLocationId"].filter(column => has("GbpMetric", column)).length;
    if (leadExists || metadata) {
      if (!columns.every(column => has("GoogleLead", column)) || metadata !== 2) throw new Error("Partial schema detected; stopped without changes.");
      return "already-present";
    }
    // One PostgreSQL statement inside the same transaction; no SQL text splitting.
    await tx.$executeRawUnsafe(`DO $google_results$ BEGIN\n${sql}\nEND $google_results$;`);
    return "applied";
  }, { timeout: 30000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient({ log: [] });
  try {
    console.log("[Google results schema]", await applyGoogleResultsSchema(prisma));
  } catch {
    console.error("[Google results schema] Verification/application failed. Deployment stopped; no credentials logged.");
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
