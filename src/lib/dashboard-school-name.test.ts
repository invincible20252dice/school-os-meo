import { describe, expect, it, vi } from "vitest";
import {
  findDashboardSchoolName,
  normalizeDashboardSchoolId,
} from "./dashboard-school-name";

describe("dashboard-school-name", () => {
  it("normalizes concrete dashboard school ids", () => {
    expect(normalizeDashboardSchoolId(" school-1 ")).toBe("school-1");
  });

  it("treats blank and all-school selections as empty", () => {
    expect(normalizeDashboardSchoolId("")).toBe("");
    expect(normalizeDashboardSchoolId("all")).toBe("");
    expect(normalizeDashboardSchoolId(null)).toBe("");
  });

  it("loads the selected school name from the database", async () => {
    const prisma = {
      school: {
        findUnique: vi.fn(async () => ({ name: "iスクール予備校" })),
      },
    };

    await expect(findDashboardSchoolName(prisma, "school-1")).resolves.toBe(
      "iスクール予備校",
    );
    expect(prisma.school.findUnique).toHaveBeenCalledWith({
      where: { id: "school-1" },
      select: { name: true },
    });
  });

  it("does not query the database when no single school is selected", async () => {
    const prisma = {
      school: {
        findUnique: vi.fn(),
      },
    };

    await expect(findDashboardSchoolName(prisma, "all")).resolves.toBe("");
    expect(prisma.school.findUnique).not.toHaveBeenCalled();
  });
});
