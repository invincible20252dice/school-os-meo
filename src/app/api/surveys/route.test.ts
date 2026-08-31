import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    survey: {
      findMany: vi.fn(),
    },
  },
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
        status: "active",
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

describe("/api/surveys", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const access = await import("@/lib/supabase-access");
    const persistence = await import("@/lib/survey-persistence");

    vi.mocked(access.resolveRequestAccess).mockResolvedValue({
      access: {
        userId: "manager",
        role: "manager",
        schoolId: "school-own",
        schoolIds: ["school-own"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    vi.mocked(persistence.persistSurvey).mockResolvedValue({ id: "survey-1" });
  });

  it("returns surveys scoped to the manager school", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([
      {
        id: "survey-1",
        schoolId: "school-own",
        title: "保護者アンケート",
        requiredKeywords: "横浜駅, 個別指導",
        minCharCount: 100,
        maxCharCount: 300,
        isValid: true,
        benefitType: "体験授業",
        benefitShowTiming: "投稿後",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        updatedAt: new Date("2026-07-21T00:00:00.000Z"),
        school: { id: "school-own", name: "青葉ゼミナール" },
        items: [
          {
            id: "item-1",
            type: "TEXT",
            question: "自由記述",
            placeholder: "例: 熊本高校",
            maxSelect: null,
            options: [],
            order: 1,
          },
        ],
      },
    ] as never);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/surveys?schoolId=school-other"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-own" },
      }),
    );
    expect(body.access).toEqual({
      role: "manager",
      effectiveSchoolId: "school-own",
      requestedSchoolId: "school-other",
      source: "profiles",
    });
    expect(body.surveys[0]).toMatchObject({
      id: "survey-1",
      schoolId: "school-own",
      schoolName: "青葉ゼミナール",
      title: "保護者アンケート",
      itemCount: 1,
      hasIncentive: true,
      items: [
        expect.objectContaining({
          placeholder: "例: 熊本高校",
        }),
      ],
    });
  });

  it("returns all surveys for admin users", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
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
      isAuthenticated: true,
    });
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
    expect(body.access.effectiveSchoolId).toBe("all");
  });

  it("keeps all-school scope when admin users request schoolId=all", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
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
      isAuthenticated: true,
    });
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/surveys?schoolId=all"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(body.access).toMatchObject({
      role: "admin",
      effectiveSchoolId: "all",
      requestedSchoolId: "all",
    });
  });

  it("falls back to all surveys when an admin-selected school has no surveys", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
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
      isAuthenticated: true,
    });
    vi.mocked(prisma.survey.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "survey-actual",
          schoolId: "cms5tnzlr0001jt04qh0lluva",
          title: "予備校下通り校",
          requiredKeywords: "下通り, 大学受験",
          minCharCount: 100,
          maxCharCount: 300,
          isValid: true,
          benefitType: null,
          benefitShowTiming: null,
          createdAt: new Date("2026-07-20T00:00:00.000Z"),
          updatedAt: new Date("2026-07-21T00:00:00.000Z"),
          school: {
            id: "cms5tnzlr0001jt04qh0lluva",
            name: "大学受験専門塾 iスクール予備校",
          },
          items: [],
        },
      ] as never);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/surveys?schoolId=stale-school"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { schoolId: "stale-school" },
      }),
    );
    expect(prisma.survey.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {},
      }),
    );
    expect(body.surveys[0]).toMatchObject({
      id: "survey-actual",
      schoolName: "大学受験専門塾 iスクール予備校",
      title: "予備校下通り校",
    });
  });

  it("loads the survey list when the production DB is missing the optional placeholder column", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findMany).mockReset();
    vi.mocked(prisma.survey.findMany)
      .mockRejectedValueOnce({
        code: "P2022",
        message: "The column SurveyItem.placeholder does not exist",
      } as never)
      .mockResolvedValueOnce([
        {
          id: "survey-1",
          schoolId: "school-own",
          title: "予備校下通り校",
          requiredKeywords: "下通り, 大学受験",
          minCharCount: 100,
          maxCharCount: 300,
          isValid: true,
          benefitType: null,
          benefitShowTiming: null,
          createdAt: new Date("2026-07-20T00:00:00.000Z"),
          updatedAt: new Date("2026-07-21T00:00:00.000Z"),
          school: { id: "school-own", name: "iスクール予備校" },
          items: [
            {
              id: "item-1",
              type: "TEXT",
              question: "高校はどこですか？",
              maxSelect: null,
              options: [],
              order: 1,
            },
          ],
        },
      ] as never);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.survey.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        include: expect.objectContaining({
          items: expect.objectContaining({
            select: expect.not.objectContaining({ placeholder: true }),
          }),
        }),
      }),
    );
    expect(body.surveys[0]).toMatchObject({
      title: "予備校下通り校",
      schoolName: "iスクール予備校",
      items: [expect.objectContaining({ placeholder: null })],
    });
    consoleErrorSpy.mockRestore();
  });

  it("filters by survey id for edit screen loading", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/surveys?id=survey-1"),
    );

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: "school-own",
          id: "survey-1",
        },
      }),
    );
  });

  it("lets admin users load an existing survey by id before reassigning it to the selected school", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
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
      isAuthenticated: true,
    });
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/surveys?id=survey-default&schoolId=school-selected",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.survey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "survey-default",
        },
      }),
    );
    expect(body.access).toMatchObject({
      role: "admin",
      effectiveSchoolId: "school-selected",
      requestedSchoolId: "school-selected",
    });
  });

  it("falls back to base Survey columns when the rich survey query fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findMany).mockRejectedValueOnce(
      new Error("joined query failed"),
    ).mockResolvedValueOnce([
      {
        id: "survey-fallback",
        schoolId: "school-own",
        title: "基本情報だけのアンケート",
        requiredKeywords: null,
        minCharCount: 100,
        maxCharCount: 300,
        isValid: true,
        benefitType: null,
        benefitShowTiming: null,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        updatedAt: new Date("2026-07-21T00:00:00.000Z"),
      },
    ] as never);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.survey.findMany).toHaveBeenCalledTimes(2);
    expect(body.surveys[0]).toMatchObject({
      id: "survey-fallback",
      schoolName: "校舎名未設定",
      title: "基本情報だけのアンケート",
      itemCount: 0,
      responseCount: 0,
      minRatingForRedirect: 4,
    });
    consoleErrorSpy.mockRestore();
  });

  it("returns an empty survey list instead of a 500 when every query fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findMany).mockRejectedValue(
      new Error("database failed"),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      surveys: [],
      access: {
        role: "admin",
        effectiveSchoolId: "all",
        requestedSchoolId: "all",
        source: "fallback",
      },
    });
    consoleErrorSpy.mockRestore();
  });

  it("does not expose surveys when session resolution fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockRejectedValueOnce(
      new Error("profiles table unavailable"),
    );
    vi.mocked(prisma.survey.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.surveys).toEqual([]);
    expect(body.access).toEqual({
      role: "unknown",
      effectiveSchoolId: "unknown",
      requestedSchoolId: "all",
      source: "unresolved",
    });
    expect(prisma.survey.findMany).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("blocks authenticated users that are still waiting for approval", async () => {
    const access = await import("@/lib/supabase-access");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending",
        role: "manager",
        schoolId: "",
        schoolIds: [],
        name: "承認待ち",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { GET } = await import("./route");
    vi.mocked(prisma.survey.findMany).mockClear();
    const response = await GET(new Request("http://localhost/api/surveys"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("アカウント承認後にアンケート設定を閲覧できます。");
    expect(prisma.survey.findMany).not.toHaveBeenCalled();
  });

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
      expect.objectContaining({
        survey: expect.objectContaining({
          findMany: expect.any(Function),
        }),
      }),
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
