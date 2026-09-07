import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    churnAlert: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "admin-1",
      role: "admin",
      schoolId: "",
      schoolIds: [],
      name: "Admin",
      email: "admin@example.com",
      status: "active",
      source: "profiles",
    },
    isAuthenticated: true,
  })),
  buildScopedSchoolFilter: vi.fn((_access, schoolId) => ({
    requestedSchoolId: schoolId,
    effectiveSchoolId: schoolId,
    role: "admin",
    canSwitchSchool: true,
  })),
}));

describe("/api/dashboard/churn-alert", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.findMany).mockResolvedValue([
      {
        id: "alert-1",
        schoolId: "school-1",
        source: "SURVEY",
        sourceRecordId: "response-1",
        guardianSegment: "高2 保護者",
        studentGrade: "高校2年",
        rating: 2,
        riskLevel: "HIGH",
        category: "質問対応",
        status: "OPEN",
        reason: "質問への返答が遅い",
        aiActionProposal: "当日中に教室長から電話し、質問対応の時間を固定する。",
        assignedTo: "教室長",
        resolvedAt: null,
        createdAt: new Date("2026-08-22T06:46:00.000Z"),
        updatedAt: new Date("2026-08-22T06:46:00.000Z"),
      },
      {
        id: "alert-2",
        schoolId: "school-1",
        source: "GOOGLE",
        sourceRecordId: "review-1",
        guardianSegment: "高3 保護者",
        studentGrade: "高校3年",
        rating: 4,
        riskLevel: "MEDIUM",
        category: "面談",
        status: "RESOLVED",
        reason: "",
        aiActionProposal: "",
        assignedTo: "",
        resolvedAt: new Date("2026-08-23T00:00:00.000Z"),
        createdAt: new Date("2026-08-21T06:46:00.000Z"),
        updatedAt: new Date("2026-08-23T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.churnAlert.update).mockResolvedValue({
      id: "alert-1",
      schoolId: "school-1",
      source: "SURVEY",
      sourceRecordId: "response-1",
      guardianSegment: "高2 保護者",
      studentGrade: "高校2年",
      rating: 2,
      riskLevel: "HIGH",
      category: "質問対応",
      status: "IN_PROGRESS",
      reason: "質問への返答が遅い",
      aiActionProposal: "当日中に教室長から電話し、質問対応の時間を固定する。",
      assignedTo: "教室長",
      resolvedAt: null,
      createdAt: new Date("2026-08-22T06:46:00.000Z"),
      updatedAt: new Date("2026-08-22T06:46:00.000Z"),
    } as never);
  });

  it("returns churn alerts scoped to the selected school", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary).toEqual({
      total: 2,
      totalAlerts: 2,
      openCount: 1,
      inProgressCount: 0,
      highRiskCount: 1,
      resolvedCount: 1,
    });
    expect(body.items).toEqual(body.alerts);
    expect(body.alerts[0]).toEqual(
      expect.objectContaining({
        id: "alert-1",
        risk: "高リスク",
        parentType: "高2 保護者",
        content: "質問への返答が遅い",
        rawStatus: "OPEN",
        statusLabel: "未対応",
        aiActionProposal: "当日中に教室長から電話し、質問対応の時間を固定する。",
        aiAdvice: "当日中に教室長から電話し、質問対応の時間を固定する。",
      }),
    );
    expect(prisma.churnAlert.findMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  });

  it("returns display-ready sample alerts while ChurnAlert table has not been pushed", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.findMany).mockRejectedValueOnce({
      code: "P2021",
      message: "The table ChurnAlert does not exist",
    } as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      summary: expect.objectContaining({
        total: 2,
        totalAlerts: 2,
        openCount: 1,
        inProgressCount: 0,
        highRiskCount: 1,
        resolvedCount: 1,
      }),
      alerts: expect.arrayContaining([
        expect.objectContaining({
          id: "alert_001",
          parentType: "高3保護者（下通校）",
          statusLabel: "未対応",
        }),
      ]),
      items: expect.any(Array),
    });
  });

  it("uses the production default school when no effective school is selected", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "",
      effectiveSchoolId: "",
      role: "admin",
      canSwitchSchool: true,
    });
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert"),
    );

    expect(response.status).toBe(200);
    expect(prisma.churnAlert.findMany).toHaveBeenCalledWith({
      where: { schoolId: "cms5tnzlr0001jt04qh0lluva" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  });

  it("treats missing ChurnAlert column errors as display-ready sample alerts", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.findMany).mockRejectedValueOnce(
      "P2022: Unknown column churnAlert.aiActionProposal",
    );
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toHaveLength(2);
    expect(body.summary.total).toBe(2);
  });

  it("returns sample alerts when the selected school has no alert records yet", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-empty"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts[0]).toEqual(expect.objectContaining({ schoolId: "school-empty" }));
    expect(body.items).toEqual(body.alerts);
  });

  it("rejects pending authenticated users", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "Pending",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-1"),
    );

    expect(response.status).toBe(403);
  });

  it("rejects pending authenticated users before status updates", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "Pending",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ alertId: "alert-1", status: "IN_PROGRESS" }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns server errors for unexpected read failures", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.findMany).mockRejectedValueOnce(new Error("DB down"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://app.example.com/api/dashboard/churn-alert?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("DB down");
  });

  it("updates alert status and resolvedAt", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ alertId: "alert-1", status: "IN_PROGRESS" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alert).toEqual(
      expect.objectContaining({
        id: "alert-1",
        status: "IN_PROGRESS",
        rawStatus: "IN_PROGRESS",
        statusLabel: "対応中",
      }),
    );
    expect(body.item).toEqual(body.alert);
    expect(prisma.churnAlert.update).toHaveBeenCalledWith({
      where: { id: "alert-1" },
      data: { status: "IN_PROGRESS", resolvedAt: null },
    });
  });

  it("sets resolvedAt when resolving an alert", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ alertId: "alert-1", status: "RESOLVED" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(prisma.churnAlert.update).mock.calls[0][0].data.resolvedAt)
      .toBeInstanceOf(Date);
  });

  it("validates PATCH body", async () => {
    const { PATCH } = await import("./route");

    const missingIdResponse = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ status: "OPEN" }),
      }),
    );
    const invalidStatusResponse = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ alertId: "alert-1", status: "DONE" }),
      }),
    );

    expect(missingIdResponse.status).toBe(400);
    expect(invalidStatusResponse.status).toBe(400);
  });

  it("returns server errors when status update fails", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.churnAlert.update).mockRejectedValueOnce(new Error("update failed"));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("https://app.example.com/api/dashboard/churn-alert", {
        method: "PATCH",
        body: JSON.stringify({ alertId: "alert-1", status: "OPEN" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("update failed");
  });
});
