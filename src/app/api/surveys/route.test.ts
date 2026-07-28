import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/supabase-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase-access")>(
    "@/lib/supabase-access",
  );

  return {
    ...actual,
    resolveRequestAccess: vi.fn(async () => ({
      access: {
        userId: "manager",
        role: "manager",
        schoolId: "school-own",
        schoolIds: ["school-own"],
        name: "教室長",
        email: "manager@example.com",
        source: "profiles",
      },
      isAuthenticated: true,
    })),
  };
});

vi.mock("@/lib/survey-persistence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/survey-persistence")>(
    "@/lib/survey-persistence",
  );

  return {
    ...actual,
    persistSurvey: vi.fn(async () => ({ id: "survey-1" })),
  };
});

describe("POST /api/surveys", () => {
  it("persists a survey scoped to the manager school", async () => {
    const persistence = await import("@/lib/survey-persistence");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-other",
          title: "アンケート",
          items: [{ type: "TEXT", question: "自由記述", order: 1 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.access).toEqual({
      role: "manager",
      effectiveSchoolId: "school-own",
      source: "profiles",
    });
    expect(persistence.persistSurvey).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        schoolId: "school-own",
      }),
    );
  });

  it("returns validation errors", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/surveys", {
        method: "POST",
        body: JSON.stringify({ schoolId: "", title: "", items: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("アンケート名を入力してください。");
  });

  it("returns the generic message for unknown persistence failures", async () => {
    const persistence = await import("@/lib/survey-persistence");
    vi.mocked(persistence.persistSurvey).mockRejectedValueOnce("failed");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-own",
          title: "アンケート",
          items: [{ type: "TEXT", question: "自由記述", order: 1 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "アンケート設定を保存できませんでした。入力内容を確認して再度お試しください。",
    );
  });

  it("does not expose raw database errors", async () => {
    const persistence = await import("@/lib/survey-persistence");
    vi.mocked(persistence.persistSurvey).mockRejectedValueOnce(
      new Error("Foreign key constraint violated on the constraint: Survey_schoolId_fkey"),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-missing",
          title: "アンケート",
          items: [{ type: "TEXT", question: "自由記述", order: 1 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "保存先の校舎情報を確認できませんでした。時間をおいて再度お試しください。",
    );
    expect(body.message).not.toContain("Foreign key");
  });
});
