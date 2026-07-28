import {
  canSwitchSchool,
  resolveEffectiveSchoolIdForRequest,
  type AuthRole,
  type AuthUserAccess,
} from "./auth-access";

export type ProfileAccessRow = {
  id?: string | null;
  role?: string | null;
  school_id?: string | null;
  school_ids?: string[] | null;
  full_name?: string | null;
};

export type SupabaseUserLike = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type ResolvedUserAccess = AuthUserAccess & {
  name: string;
  email: string;
  source: "profiles" | "user_metadata" | "fallback";
};

export type ScopedSchoolAccess = {
  requestedSchoolId: string;
  effectiveSchoolId?: string;
  role: AuthRole;
  canSwitchSchool: boolean;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAccessRole(value: unknown): AuthRole {
  const role = normalizeString(value).toLowerCase();

  if (role === "admin" || role === "headquarters" || role === "owner") {
    return "admin";
  }

  if (role === "manager" || role === "staff") {
    return "manager";
  }

  return "manager";
}

function normalizeSchoolIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  const schoolId = normalizeString(value);

  return schoolId ? [schoolId] : [];
}

export function resolveUserAccessFromSupabase(
  user: SupabaseUserLike,
  profile?: ProfileAccessRow | null,
): ResolvedUserAccess {
  const metadata = user.user_metadata || {};
  const role = normalizeAccessRole(profile?.role || metadata.role);
  const profileSchoolIds =
    profile?.school_ids && profile.school_ids.length
      ? profile.school_ids
      : profile?.school_id;
  const metadataSchoolIds = metadata.school_ids || metadata.school_id;
  const schoolIds = normalizeSchoolIds(profileSchoolIds || metadataSchoolIds);
  const schoolId = normalizeString(profile?.school_id || metadata.school_id) ||
    schoolIds[0] ||
    "";
  const name =
    normalizeString(profile?.full_name) ||
    normalizeString(metadata.full_name) ||
    normalizeString(metadata.name) ||
    normalizeString(user.email) ||
    "ユーザー";

  return {
    userId: user.id,
    role,
    schoolId,
    schoolIds: role === "admin" ? schoolIds : schoolIds.filter(Boolean),
    name,
    email: normalizeString(user.email),
    source: profile ? "profiles" : Object.keys(metadata).length ? "user_metadata" : "fallback",
  };
}

export function resolveScopedSchoolAccess(
  user: AuthUserAccess,
  requestedSchoolId: string | null | undefined,
): ScopedSchoolAccess {
  const effectiveSchoolId = resolveEffectiveSchoolIdForRequest(
    user,
    requestedSchoolId,
  );

  return {
    requestedSchoolId: requestedSchoolId?.trim() || "all",
    effectiveSchoolId,
    role: user.role,
    canSwitchSchool: canSwitchSchool(user),
  };
}
