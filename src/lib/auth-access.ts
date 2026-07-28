export type AuthRole =
  | "HEADQUARTERS"
  | "OWNER"
  | "admin"
  | "owner"
  | "staff"
  | "manager";

export type AuthUserAccess = {
  userId: string;
  role: AuthRole;
  schoolIds: string[];
  schoolId?: string;
};

export type SchoolOption = {
  id: string;
  name: string;
};

export type DashboardAccessContext = {
  user: AuthUserAccess & {
    name: string;
  };
  schools: SchoolOption[];
  currentSchoolId: string;
  currentSchoolName: string;
  canSwitchSchool: boolean;
};

export type LoginProvider = {
  id: "google";
  label: string;
  description: string;
};

export function getDemoGoogleLoginPath() {
  return "/dashboard";
}

export function getDashboardSettingsPath() {
  return "/dashboard/settings";
}

export function getDemoLogoutPath() {
  return "/login";
}

export function buildMagicLinkMessage(email: string) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "メールアドレスを入力してください。";
  }

  return `${trimmedEmail} 宛に認証リンクを送信しました。`;
}

export function buildLoginProviders(): LoginProvider[] {
  return [
    {
      id: "google",
      label: "Googleでログイン",
      description: "Google Workspaceアカウントで本部・教室長を認証します。",
    },
  ];
}

export function canAccessSchool(user: AuthUserAccess, schoolId: string) {
  if (isAllSchoolRole(user.role)) {
    return true;
  }

  return user.schoolIds.includes(schoolId);
}

export function getAccessibleSchoolIds(user: AuthUserAccess, allSchoolIds: string[]) {
  if (isAllSchoolRole(user.role)) {
    return allSchoolIds;
  }

  return allSchoolIds.filter((schoolId) => user.schoolIds.includes(schoolId));
}

export function getPostLoginPath(user: AuthUserAccess) {
  return isAllSchoolRole(user.role) ? "/dashboard" : "/dashboard/settings";
}

export function isAllSchoolRole(role: AuthRole) {
  return role === "HEADQUARTERS" || role === "admin" || role === "owner";
}

export function isFixedSchoolRole(role: AuthRole) {
  return role === "OWNER" || role === "staff" || role === "manager";
}

export function canSwitchSchool(user: AuthUserAccess) {
  return isAllSchoolRole(user.role);
}

export function resolveCurrentSchoolId(
  user: AuthUserAccess,
  requestedSchoolId: string | null | undefined,
) {
  if (canSwitchSchool(user)) {
    return requestedSchoolId?.trim() || "all";
  }

  return user.schoolId || user.schoolIds[0] || "";
}

export function resolveEffectiveSchoolIdForRequest(
  user: AuthUserAccess,
  requestedSchoolId: string | null | undefined,
) {
  const currentSchoolId = resolveCurrentSchoolId(user, requestedSchoolId);

  return currentSchoolId === "all" ? undefined : currentSchoolId;
}

export function getSchoolName(
  schools: SchoolOption[],
  schoolId: string | null | undefined,
) {
  if (!schoolId || schoolId === "all") {
    return "全校舎サマリー";
  }

  return schools.find((school) => school.id === schoolId)?.name || "校舎未設定";
}

export function buildDemoDashboardAccessContext(
  override: Partial<AuthUserAccess & { name: string }> = {},
): DashboardAccessContext {
  const schools = [
    { id: "school-demo-001", name: "青葉ゼミナール 本校" },
    { id: "school-demo-002", name: "青葉ゼミナール 駅前校" },
    { id: "school-demo-003", name: "青葉ゼミナール 南口校" },
  ];
  const user = {
    userId: override.userId || "user-admin-demo",
    name: override.name || "佐藤 教室長",
    role: override.role || "owner",
    schoolId: override.schoolId || "school-demo-001",
    schoolIds: override.schoolIds || schools.map((school) => school.id),
  };
  const currentSchoolId = resolveCurrentSchoolId(
    user,
    override.schoolId || "all",
  );

  return {
    user,
    schools,
    currentSchoolId,
    currentSchoolName: getSchoolName(schools, currentSchoolId),
    canSwitchSchool: canSwitchSchool(user),
  };
}
