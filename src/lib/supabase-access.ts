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
  from(table: "profiles"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): Promise<{
          data: {
            id?: string | null;
            role?: string | null;
            school_id?: string | null;
            school_ids?: string[] | null;
            full_name?: string | null;
          } | null;
          error: { message: string } | null;
        }>;
      };
    };
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
      source: "fallback",
    },
    isAuthenticated: false,
  };
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
    .select("id, role, school_id, school_ids, full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    access: resolveUserAccessFromSupabase(data.user, profileResult.data),
    isAuthenticated: true,
  };
}

export function buildScopedSchoolFilter(
  access: ResolvedUserAccess,
  requestedSchoolId: string | null | undefined,
) {
  return resolveScopedSchoolAccess(access, requestedSchoolId);
}
