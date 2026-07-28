import { beforeEach, describe, expect, it, vi } from "vitest";

const profilesSelectSingle = vi.fn();
const profilesUpsert = vi.fn();
const listUsers = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findMany: vi.fn(async () => [{ id: "school-1", name: "青葉ゼミナール" }]),
      findUnique: vi.fn(async () => ({ id: "school-1" })),
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
    from: vi.fn(() => ({
      select: profilesSelectSingle,
      upsert: profilesUpsert,
    })),
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

  it("returns a Japanese message when Supabase auth user listing fails", async () => {
    listUsers.mockResolvedValueOnce({
      data: { users: [] },
      error: { message: "supabase auth unavailable" },
    });
    mockProfiles([]);
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
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("ユーザー一覧を取得できませんでした。");
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
