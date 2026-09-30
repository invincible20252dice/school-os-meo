import { readFileSync } from "node:fs";

// Preview builds must never migrate a shared production database.
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) throw new Error("Production DATABASE_URL is required for schema alignment");
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("connect_timeout", "15");
  url.searchParams.set("socket_timeout", "45");
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    console.log("Checking Review.status schema alignment...");
    await prisma.$executeRawUnsafe(readFileSync("prisma/review-status-enum.sql", "utf8"));
    // Use the same pooled connection as the app, not the migration engine's direct-connection protocol.
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(readFileSync("prisma/review-status-alignment.sql", "utf8"));
      await tx.review.count({ where: { source: "GOOGLE", status: { notIn: ["DRAFT", "GENERATED", "ARCHIVED"] } } });
    }, { maxWait: 15000, timeout: 45000 });
    console.log("Review.status schema alignment and Prisma query verification completed.");
  } finally {
    await prisma.$disconnect();
  }
}
