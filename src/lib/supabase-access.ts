import {
  resolveScopedSchoolAccess,
  resolveUserAccessFromSupabase,
  type ResolvedUserAccess,
} from "./access-control";
import type { AuthRole } from "./auth-access";
import { createServerSupabaseClient } from "./supabase";

type SupabaseAccessClient = {
  auth: {
    getUser(jwt?: string): Promise<{
      data: {
        user: {
          id: string;
          email?: string;
          user_metadata?: Record<string, unknown>;
        } | null;
      };
      error: { message: string } | null;
    }>;
  };
  from(table: string): SupabaseTableClient;
};

type SupabaseProfileRecord = {
  id?: string | null;
  role?: string | null;
  school_id?: string | null;
  school_ids?: string[] | null;
  full_name?: string | null;
  status?: string | null;
};

type SupabaseInvitationRecord = {
  email?: string | null;
  role?: string | null;
  school_id?: string | null;
  status?: string | null;
};

type SupabaseQueryResult<T> = Promise<{
  data: T | null;
  error: { message: string } | null;
}>;

type SupabaseTableClient = {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): SupabaseQueryResult<SupabaseProfileRecord | SupabaseInvitationRecord>;
    };
  };
  upsert(
    data: Record<string, unknown>,
    options: { onConflict: string },
  ): {
    select(columns: string): {
      maybeSingle(): SupabaseQueryResult<SupabaseProfileRecord>;
    };
  };
  update(data: Record<string, unknown>): {
    eq(column: string, value: string): SupabaseQueryResult<Record<string, unknown>>;
  };
};

export type RequestAccessResult = {
  access: ResolvedUserAccess;
  isAuthenticated: boolean;
};

function getBearerToken(request: Request) {
  const explicitSupabaseToken =
    request.headers.get("x-supabase-access-token") ||
    request.headers.get("x-user-access-token") ||
    "";

  if (explicitSupabaseToken.trim()) {
    return explicitSupabaseToken.trim();
  }

  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  const trimmedToken = token?.trim() || "";

  if (
    process.env.ANALYTICS_API_SECRET &&
    trimmedToken === process.env.ANALYTICS_API_SECRET
  ) {
    return "";
  }

  return scheme.toLowerCase() === "bearer" && trimmedToken ? trimmedToken : "";
}

function getFallbackAccess(request: Request, url: URL): RequestAccessResult {
  const role =
    request.headers.get("x-user-role") || url.searchParams.get("role") || "admin";
  const schoolId =
    request.headers.get("x-user-school-id") ||
    url.searchParams.get("userSchoolId") ||
    "";
  const userId = url.searchParams.get("ownerId") || "demo-user";

  return {
    access: {
      userId,
      role: role as AuthRole,
      schoolId,
      schoolIds: schoolId ? [schoolId] : [],
      name: "Demo User",
      email: "",
      status: "active",
      source: "fallback",
    },
    isAuthenticated: false,
  };
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizeRole(value: string | null | undefined) {
  return value === "admin" ? "admin" : "manager";
}

async function applyProfileInvitation(
  client: SupabaseAccessClient,
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
): Promise<SupabaseProfileRecord | null> {
  const email = normalizeEmail(user.email);

  if (!email) {
    return null;
  }

  const invitationResult = await client
    .from("profile_invitations")
    .select("email, role, school_id, status")
    .eq("email", email)
    .maybeSingle();

  if (invitationResult.error) {
    throw new Error(invitationResult.error.message);
  }

  const invitation = invitationResult.data as SupabaseInvitationRecord | null;

  if (!invitation || invitation.status === "revoked") {
    return null;
  }

  const role = normalizeRole(invitation.role);
  const schoolId = role === "admin" ? "" : invitation.school_id?.trim() || "";

  if (role === "manager" && !schoolId) {
    return null;
  }

  const fullName =
    String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() ||
    email;
  const profileResult = await client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        role,
        school_id: role === "admin" ? null : schoolId,
        school_ids: role === "admin" ? [] : [schoolId],
        full_name: fullName,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, role, school_id, school_ids, full_name, status")
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  await client
    .from("profile_invitations")
    .update({
      status: "accepted",
      accepted_user_id: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("email", email);

  return profileResult.data;
}

export async function resolveRequestAccess(
  request: Request,
  url: URL,
  client?: SupabaseAccessClient,
): Promise<RequestAccessResult> {
  const token = getBearerToken(request);

  if (!token) {
    return getFallbackAccess(request, url);
  }

  const supabaseClient =
    client || (createServerSupabaseClient() as unknown as SupabaseAccessClient);
  const { data, error } = await supabaseClient.auth.getUser(token);

  if (error || !data.user) {
    throw new Error(error?.message || "ログインユーザーを確認できません。");
  }

  const profileResult = await supabaseClient
    .from("profiles")
    .select("id, role, school_id, school_ids, full_name, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  let profile = profileResult.data as SupabaseProfileRecord | null;

  if (!profile || profile.status !== "active") {
    profile = (await applyProfileInvitation(supabaseClient, data.user)) || profile;
  }

  return {
    access: resolveUserAccessFromSupabase(data.user, profile),
    isAuthenticated: true,
  };
}

export function buildScopedSchoolFilter(
  access: ResolvedUserAccess,
  requestedSchoolId: string | null | undefined,
) {
  return resolveScopedSchoolAccess(access, requestedSchoolId);
}
