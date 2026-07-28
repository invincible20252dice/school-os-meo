import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(async () => ({ id: "system-user" })),
    },
    school: {
      findMany: vi.fn(async () => [{ id: "school-1", name: "青葉ゼミナール" }]),
      create: vi.fn(async () => ({ id: "school-new", name: "新宿校" })),
      update: vi.fn(async ({ data }: { data: { name?: string } }) => ({
        id: "school-1",
        name: data.name || "青葉ゼミナール",
      })),
    },
  },
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

describe("/api/admin/schools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists active schools for admins", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/schools"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.school.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ACTIVE" } }),
    );
    expect(body.schools).toEqual([{ id: "school-1", name: "青葉ゼミナール" }]);
  });

  it("creates a school with the system owner", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/schools", {
        method: "POST",
        body: JSON.stringify({ name: " 新宿校 " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "system-user" },
      }),
    );
    expect(prisma.school.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "system-user",
          name: "新宿校",
          status: "ACTIVE",
        }),
      }),
    );
    expect(body.school.name).toBe("新宿校");
  });

  it("requires a school name before creating", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/schools", {
        method: "POST",
        body: JSON.stringify({ name: " " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("校舎名を入力してください。");
  });

  it("rejects unauthenticated school management requests", async () => {
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
    const response = await GET(new Request("http://localhost/api/admin/schools"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("ログイン後に校舎管理を利用できます。");
  });

  it("updates a school name", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/schools", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-1", name: "駅前校" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "school-1" },
        data: { name: "駅前校", brandName: "駅前校" },
      }),
    );
  });

  it("requires a school id and name before updating", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/schools", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "", name: "" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("校舎IDと校舎名を確認してください。");
  });

  it("returns a Japanese message when school update fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.update).mockRejectedValueOnce(new Error("database"));
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/schools", {
        method: "PATCH",
        body: JSON.stringify({ schoolId: "school-1", name: "駅前校" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("校舎名を更新できませんでした。");
  });

  it("archives a school instead of destructive deletion", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/admin/schools", {
        method: "DELETE",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.school.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "school-1" },
        data: { status: "ARCHIVED" },
      }),
    );
  });

  it("requires a school id before deletion", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/admin/schools", {
        method: "DELETE",
        body: JSON.stringify({ schoolId: "" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("削除する校舎を確認してください。");
  });

  it("returns a Japanese message when school deletion fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.update).mockRejectedValueOnce(new Error("database"));
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/admin/schools", {
        method: "DELETE",
        body: JSON.stringify({ schoolId: "school-1" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("校舎を削除できませんでした。");
  });

  it("returns a Japanese message when school creation fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.create).mockRejectedValueOnce(new Error("database"));
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/admin/schools", {
        method: "POST",
        body: JSON.stringify({ name: "新宿校" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("校舎を追加できませんでした。");
  });

  it("rejects manager access", async () => {
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
    const response = await GET(new Request("http://localhost/api/admin/schools"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("校舎管理は本部管理者のみ利用できます。");
  });
});
