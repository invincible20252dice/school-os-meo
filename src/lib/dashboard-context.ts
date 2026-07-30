import { isApprovedAccess, type ResolvedUserAccess } from "./access-control";

export type DashboardSchoolOption = {
  id: string;
  name: string;
};

export type DashboardContext = {
  user: {
    id: string;
    name: string;
    role: string;
    schoolId: string;
  };
  schools: DashboardSchoolOption[];
  currentSchoolId: string;
  currentSchoolName: string;
  canSwitchSchool: boolean;
};

function isAllSchoolRole(role: string) {
  return ["HEADQUARTERS", "admin", "owner"].includes(role);
}

export function canSwitchDashboardSchool(access: ResolvedUserAccess) {
  return isApprovedAccess(access) && isAllSchoolRole(access.role);
}

export function resolveDashboardCurrentSchool(
  access: ResolvedUserAccess,
  schools: DashboardSchoolOption[],
  requestedSchoolId?: string | null,
) {
  const requested = requestedSchoolId?.trim() || "";
  const requestedSchool = schools.find((school) => school.id === requested);

  if (requestedSchool) {
    return requestedSchool;
  }

  const assignedSchool = schools.find((school) => school.id === access.schoolId);

  if (assignedSchool) {
    return assignedSchool;
  }

  return schools[0] || null;
}

export function buildDashboardContext({
  access,
  schools,
  requestedSchoolId,
}: {
  access: ResolvedUserAccess;
  schools: DashboardSchoolOption[];
  requestedSchoolId?: string | null;
}): DashboardContext {
  const currentSchool = resolveDashboardCurrentSchool(
    access,
    schools,
    requestedSchoolId,
  );
  const currentSchoolId = currentSchool?.id || "";

  return {
    user: {
      id: access.userId,
      name: access.name,
      role: access.role,
      schoolId: access.schoolId || currentSchoolId,
    },
    schools,
    currentSchoolId,
    currentSchoolName: currentSchool?.name || "校舎未設定",
    canSwitchSchool: canSwitchDashboardSchool(access),
  };
}
