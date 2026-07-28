import { NextResponse } from "next/server";
import { canManageUsers } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase";
import { resolveRequestAccess } from "@/lib/supabase-access";

type ProfileRow = {
  id: string;
  role: string | null;
  school_id: string | null;
  school_ids: string[] | null;
  full_name: string | null;
  status: string | null;
};

type UpdatePayload = {
  userId?: string;
  role?: string;
  schoolId?: string;
  status?: string;
};

function normalizeRole(value: unknown) {
  return value === "admin" ? "admin" : "manager";
}

function normalizeStatus(value: unknown) {
  return value === "active" ? "active" : "pending";
}

async function assertAdminAccess(request: Request) {
  const url = new URL(request.url);
  const result = await resolveRequestAccess(request, url);

  if (!canManageUsers(result.access)) {
    throw new Error("FORBIDDEN");
  }

  return result.access;
}

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const supabase = createServerSupabaseClient();
    const [{ data: authUsers, error: authError }, profileResult, schools] =
      await Promise.all([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase
          .from("profiles")
          .select("id, role, school_id, school_ids, full_name, status"),
        prisma.school.findMany({
          orderBy: [{ name: "asc" }],
          select: { id: true, name: true },
        }),
      ]);

    if (authError) {
      throw new Error(authError.message);
    }

    if (profileResult.error) {
      throw new Error(profileResult.error.message);
    }

    const profiles = new Map(
      ((profileResult.data || []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile,
      ]),
    );
    const users = authUsers.users.map((user) => {
      const profile = profiles.get(user.id);
      const role = profile?.role || "manager";
      const schoolId = profile?.school_id || "";
      const status =
        profile?.status === "active" && (role === "admin" || schoolId)
          ? "active"
          : "pending";

      return {
        id: user.id,
        email: user.email || "",
        fullName:
          profile?.full_name ||
          String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
        role,
        schoolId,
        schoolIds: profile?.school_ids || (schoolId ? [schoolId] : []),
        status,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at || null,
      };
    });

    return NextResponse.json({ users, schools });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500;

    return NextResponse.json(
      {
        message:
          status === 403
            ? "ユーザー権限管理は本部管理者のみ利用できます。"
            : "ユーザー一覧を取得できませんでした。",
      },
      { status },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await assertAdminAccess(request);
    const body = (await request.json()) as UpdatePayload;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const role = normalizeRole(body.role);
    const status = normalizeStatus(body.status);
    const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";

    if (!userId) {
      return NextResponse.json(
        { message: "ユーザーIDを確認できませんでした。" },
        { status: 400 },
      );
    }

    if (role === "manager" && status === "active" && !schoolId) {
      return NextResponse.json(
        { message: "教室長を承認するには担当校舎を選択してください。" },
        { status: 400 },
      );
    }

    if (schoolId) {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true },
      });

      if (!school) {
        return NextResponse.json(
          { message: "選択した校舎が見つかりません。" },
          { status: 400 },
        );
      }
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          role,
          school_id: role === "admin" ? null : schoolId,
          school_ids: role === "admin" ? [] : schoolId ? [schoolId] : [],
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id, role, school_id, school_ids, status")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 500;

    return NextResponse.json(
      {
        message:
          status === 403
            ? "ユーザー権限管理は本部管理者のみ利用できます。"
            : "ユーザー権限を更新できませんでした。",
      },
      { status },
    );
  }
}
