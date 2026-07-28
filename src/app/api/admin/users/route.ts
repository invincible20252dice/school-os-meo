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

type InvitationRow = {
  email: string;
  role: string | null;
  school_id: string | null;
  status: string | null;
  created_at: string;
  accepted_at: string | null;
};

type UpdatePayload = {
  userId?: string;
  role?: string;
  schoolId?: string;
  status?: string;
};

type InvitePayload = {
  email?: string;
  role?: string;
  schoolId?: string;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRole(value: unknown) {
  return value === "admin" ? "admin" : "manager";
}

function normalizeStatus(value: unknown) {
  return value === "active" ? "active" : "pending";
}

async function assertAdminAccess(request: Request) {
  const url = new URL(request.url);
  const result = await resolveRequestAccess(request, url);

  if (!result.isAuthenticated) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!canManageUsers(result.access)) {
    throw new Error("FORBIDDEN");
  }

  return result.access;
}

export async function GET(request: Request) {
  try {
    await assertAdminAccess(request);
    const supabase = createServerSupabaseClient();
    const [
      { data: authUsers, error: authError },
      profileResult,
      invitationResult,
      schools,
    ] = await Promise.all([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase
          .from("profiles")
          .select("id, role, school_id, school_ids, full_name, status"),
        supabase
          .from("profile_invitations")
          .select("email, role, school_id, status, created_at, accepted_at"),
        prisma.school.findMany({
          where: { status: "ACTIVE" },
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

    if (invitationResult.error) {
      throw new Error(invitationResult.error.message);
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

    const invitations = ((invitationResult.data || []) as InvitationRow[]).map(
      (invitation) => ({
        email: invitation.email,
        role: invitation.role || "manager",
        schoolId: invitation.school_id || "",
        status: invitation.status || "pending",
        createdAt: invitation.created_at,
        acceptedAt: invitation.accepted_at || null,
      }),
    );

    return NextResponse.json({ users, schools, invitations });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHENTICATED"
        ? 401
        : error instanceof Error && error.message === "FORBIDDEN"
          ? 403
          : 500;

    return NextResponse.json(
      {
        message:
          status === 401
            ? "ログイン後にユーザー権限管理を利用できます。"
            : status === 403
            ? "ユーザー権限管理は本部管理者のみ利用できます。"
            : "ユーザー一覧を取得できませんでした。",
      },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await assertAdminAccess(request);
    const body = (await request.json()) as InvitePayload;
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);
    const schoolId = typeof body.schoolId === "string" ? body.schoolId.trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { message: "招待するメールアドレスを入力してください。" },
        { status: 400 },
      );
    }

    if (role === "manager" && !schoolId) {
      return NextResponse.json(
        { message: "教室長を招待するには担当校舎を選択してください。" },
        { status: 400 },
      );
    }

    if (schoolId) {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, status: true },
      });

      if (!school || school.status !== "ACTIVE") {
        return NextResponse.json(
          { message: "選択した校舎が見つかりません。" },
          { status: 400 },
        );
      }
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("profile_invitations")
      .upsert(
        {
          email,
          role,
          school_id: role === "admin" ? null : schoolId,
          status: "pending",
          invited_by: admin.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      )
      .select("email, role, school_id, status, created_at, accepted_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ invitation: data }, { status: 201 });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHENTICATED"
        ? 401
        : error instanceof Error && error.message === "FORBIDDEN"
          ? 403
          : 500;

    return NextResponse.json(
      {
        message:
          status === 401
            ? "ログイン後にユーザー招待を利用できます。"
            : status === 403
              ? "ユーザー招待は本部管理者のみ利用できます。"
              : "ユーザー招待を保存できませんでした。",
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
    const status =
      error instanceof Error && error.message === "UNAUTHENTICATED"
        ? 401
        : error instanceof Error && error.message === "FORBIDDEN"
          ? 403
          : 500;

    return NextResponse.json(
      {
        message:
          status === 401
            ? "ログイン後にユーザー権限を更新できます。"
            : status === 403
            ? "ユーザー権限管理は本部管理者のみ利用できます。"
            : "ユーザー権限を更新できませんでした。",
      },
      { status },
    );
  }
}
