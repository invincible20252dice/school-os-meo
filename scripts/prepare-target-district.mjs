import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
if (process.env.VERCEL_ENV === "production") {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(readFileSync("prisma/migrations/20261007020000_add_target_district/migration.sql", "utf8"));
      await tx.targetDistrict.count();
    }, { timeout: 45000 });
    console.log("TargetDistrict additive schema verified.");
  } finally { await prisma.$disconnect(); }
}
