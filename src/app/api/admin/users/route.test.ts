import { beforeEach, describe, expect, it, vi } from "vitest";

const profilesSelectSingle = vi.fn();
const profilesUpsert = vi.fn();
const invitationsSelect = vi.fn();
const invitationsUpsert = vi.fn();
const listUsers = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findMany: vi.fn(async () => [{ id: "school-1", name: "青葉ゼミナール" }]),
      findUnique: vi.fn(async () => ({ id: "school-1", status: "ACTIVE" })),
    },
  },
}));

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers,
      },
    },
    from: vi.fn((table: string) =>
      table === "profile_invitations"
        ? {
            select: invitationsSelect,
            upsert: invitationsUpsert,
          }
        : {
            select: profilesSelectSingle,
            upsert: profilesUpsert,
          },
    ),
  })),
}));

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    isAuthenticated: true,
    access: {
      userId: "admin",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "本部",
      email: "admin@example.com",
      status: "active",
      source: "profiles",
    },
  })),
}));

function mockProfiles(data: unknown[]) {
  profilesSelectSingle.mockReturnValueOnce({
    data,
    error: null,
  });
}

function mockInvitations(data: unknown[] = []) {
  invitationsSelect.mockReturnValueOnce({
    data,
    error: null,
  });
}

function mockProfileUpdate(data: unknown) {
  profilesUpsert.mockReturnValueOnce({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data, error: null })),
    })),
  });
}

function mockProfileUpdateError(message: string) {
  profilesUpsert.mockReturnValueOnce({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: null, error: { message } })),
    })),
  });
}

function mockInvitationUpdate(data: unknown) {
  invitationsUpsert.mockReturnValueOnce({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data, error: null })),
    })),
  });
}

function mockInvitationUpdateError(message: string) {
  invitationsUpsert.mockReturnValueOnce({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: null, error: { message } })),
    })),
  });
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists auth users with profile approval state and schools", async () => {
    listUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: "user-1",
            email: "pending@example.com",
            user_metadata: {},
            created_at: "2026-07-01T00:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
      },
      error: null,
    });
    mockProfiles([
      {
        id: "user-1",
        role: "manager",
        school_id: null,
        school_ids: [],
        full_name: "承認待ち",
        status: "pending",
      },
    ]);
    mockInvitations([
      {
        email: "invited@example.com",
        role: "manager",
        school_id: "school-1",
        status: "pending",
        created_at: "2026-07-02T00:00:00.000Z",
        accepted_at: null,
      },
    ]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0]).toMatchObject({
      id: "user-1",
      email: "pending@example.com",
      role: "manager",
      schoolId: "",
      status: "pending",
    });
    expect(body.schools).toEqual([{ id: "school-1", name: "青葉ゼミナール" }]);
    expect(body.invitations[0]).toMatchObject({
      email: "invited@example.com",
      role: "manager",
      schoolId: "school-1",
      status: "pending",
    });
  });

  it("lists users without profiles as pending managers", async () => {
    listUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: "user-2",
            email: "",
            user_metadata: { name: "Google名" },
            created_at: "2026-07-02T00:00:00.000Z",
            last_sign_in_at: "2026-07-03T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });
    mockProfiles([]);
    mockInvitations([]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0]).toMatchObject({
      id: "user-2",
      email: "",
      fullName: "Google名",
      role: "manager",
      schoolId: "",
      schoolIds: [],
      status: "pending",
      lastSignInAt: "2026-07-03T00:00:00.000Z",
    });
  });

  it("keeps active admin users approved without a school assignment", async () => {
    listUsers.mockResolvedValueOnce({
      data: {
        users: [
          {
            id: "admin-user",
            email: "admin@example.com",
            user_metadata: {},
            created_at: "2026-07-02T00:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
      },
      error: null,
    });
    mockProfiles([
      {
        id: "admin-user",
        role: "admin",
        school_id: null,
        school_ids: [],
        full_name: "本部管理者",
        status: "active",
      },
    ]);
    mockInvitations([]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users[0]).toMatchObject({
      role: "admin",
      schoolId: "",
      status: "active",
    });
  });

  it("returns a Japanese message when Supabase auth user listing fails", async () => {
    listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: { message: "supabase auth unavailable" },
    });
    mockProfiles([]);
    mockInvitations([]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー一覧を取得できませんでした。");
  });

  it("returns a Japanese message when profile listing fails", async () => {
    listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: null,
    });
    profilesSelectSingle.mockReturnValueOnce({
      data: null,
      error: { message: "profile schema missing" },
    });
    mockInvitations([]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー一覧を取得できませんでした。");
  });

  it("returns a Japanese message when invitation listing fails", async () => {
    listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: null,
    });
    mockProfiles([]);
    invitationsSelect.mockReturnValueOnce({
      data: null,
      error: { message: "invitations schema missing" },
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー一覧を取得できませんでした。");
  });

  it("rejects unauthenticated user management requests", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: false,
      access: {
        userId: "demo",
        role: "admin",
        schoolId: "",
        schoolIds: [],
        name: "Demo",
        email: "",
        status: "active",
        source: "fallback",
      },
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("ログイン後にユーザー権限管理を利用できます。");
  });

  it("creates a manager invitation with a school assignment", async () => {
    mockInvitationUpdate({
      email: "manager@example.com",
      role: "manager",
      school_id: "school-1",
      status: "pending",
      created_at: "2026-07-02T00:00:00.000Z",
      accepted_at: null,
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: " Manager@Example.com ",
          role: "manager",
          schoolId: "school-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(invitationsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "manager@example.com",
        role: "manager",
        school_id: "school-1",
        status: "pending",
        invited_by: "admin",
      }),
      { onConflict: "email" },
    );
    expect(body.invitation.email).toBe("manager@example.com");
  });

  it("creates an admin invitation without a school assignment", async () => {
    mockInvitationUpdate({
      email: "admin@example.com",
      role: "admin",
      school_id: null,
      status: "pending",
      created_at: "2026-07-02T00:00:00.000Z",
      accepted_at: null,
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@example.com",
          role: "admin",
          schoolId: "",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(invitationsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        role: "admin",
        school_id: null,
      }),
      { onConflict: "email" },
    );
  });

  it("requires a valid invitation email", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: "invalid", role: "admin" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("招待するメールアドレスを入力してください。");
  });

  it("rejects invitation creation from unauthenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: false,
      access: {
        userId: "demo",
        role: "admin",
        schoolId: "",
        schoolIds: [],
        name: "Demo",
        email: "",
        status: "active",
        source: "fallback",
      },
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", role: "admin" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("ログイン後にユーザー招待を利用できます。");
  });

  it("returns a Japanese message when invitation upsert fails", async () => {
    mockInvitationUpdateError("database unavailable");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@example.com",
          role: "admin",
          schoolId: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー招待を保存できませんでした。");
  });

  it("requires a school before inviting a manager", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "manager@example.com",
          role: "manager",
          schoolId: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("教室長を招待するには担当校舎を選択してください。");
  });

  it("rejects an inactive school assignment before inviting", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-archived",
      status: "ARCHIVED",
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "manager@example.com",
          role: "manager",
          schoolId: "school-archived",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("選択した校舎が見つかりません。");
  });

  it("rejects invitation creation from non-admin users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: true,
      access: {
        userId: "manager",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
    });
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email: "admin@example.com", role: "admin" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("ユーザー招待は本部管理者のみ利用できます。");
  });

  it("rejects non-admin users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: true,
      access: {
        userId: "manager",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("ユーザー権限管理は本部管理者のみ利用できます。");
  });

  it("requires a school before approving a manager", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "active",
          schoolId: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("教室長を承認するには担当校舎を選択してください。");
  });

  it("rejects permission updates from unauthenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: false,
      access: {
        userId: "demo",
        role: "admin",
        schoolId: "",
        schoolIds: [],
        name: "Demo",
        email: "",
        status: "active",
        source: "fallback",
      },
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "admin",
          status: "active",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("ログイン後にユーザー権限を更新できます。");
  });

  it("rejects permission updates from non-admin users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      isAuthenticated: true,
      access: {
        userId: "manager",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "active",
          schoolId: "school-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("ユーザー権限管理は本部管理者のみ利用できます。");
  });

  it("requires a user id before updating permissions", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: " ",
          role: "manager",
          status: "pending",
          schoolId: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("ユーザーIDを確認できませんでした。");
  });

  it("rejects an unknown school assignment", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "active",
          schoolId: "missing-school",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("選択した校舎が見つかりません。");
  });

  it("keeps an unapproved manager pending without a school assignment", async () => {
    mockProfileUpdate({
      id: "user-1",
      role: "manager",
      school_id: "",
      school_ids: [],
      status: "pending",
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "pending",
          schoolId: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        role: "manager",
        school_id: "",
        school_ids: [],
        status: "pending",
      }),
      { onConflict: "id" },
    );
    expect(body.profile.status).toBe("pending");
  });

  it("approves a manager with a school assignment", async () => {
    mockProfileUpdate({
      id: "user-1",
      role: "manager",
      school_id: "school-1",
      school_ids: ["school-1"],
      status: "active",
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "active",
          schoolId: "school-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        role: "manager",
        school_id: "school-1",
        school_ids: ["school-1"],
        status: "active",
      }),
      { onConflict: "id" },
    );
    expect(body.profile.status).toBe("active");
  });

  it("approves an admin without a school assignment", async () => {
    mockProfileUpdate({
      id: "user-1",
      role: "admin",
      school_id: null,
      school_ids: [],
      status: "active",
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "admin",
          status: "active",
          schoolId: "school-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        role: "admin",
        school_id: null,
        school_ids: [],
        status: "active",
      }),
      { onConflict: "id" },
    );
    expect(body.profile.role).toBe("admin");
  });

  it("returns a Japanese message when profile update fails", async () => {
    mockProfileUpdateError("database unavailable");
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user-1",
          role: "manager",
          status: "active",
          schoolId: "school-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー権限を更新できませんでした。");
  });
});
