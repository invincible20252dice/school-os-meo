type SchoolNamePrismaClient = {
  school: {
    findUnique(args: unknown): Promise<{ name: string } | null>;
  };
};

export function normalizeDashboardSchoolId(value: unknown) {
  const schoolId = typeof value === "string" ? value.trim() : "";

  return schoolId && schoolId !== "all" ? schoolId : "";
}

export async function findDashboardSchoolName(
  prisma: SchoolNamePrismaClient,
  schoolIdValue: unknown,
) {
  const schoolId = normalizeDashboardSchoolId(schoolIdValue);

  if (!schoolId) {
    return "";
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });

  return school?.name || "";
}
