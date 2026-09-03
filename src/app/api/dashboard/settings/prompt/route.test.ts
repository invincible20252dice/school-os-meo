import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "@/lib/supabase-access";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    access: {
      userId: "manager-1",
      role: "manager",
      schoolId: "school-1",
      schoolIds: ["school-1"],
      name: "教室長",
      email: "manager@example.com",
      status: "active",
      source: "profiles",
    },
    isAuthenticated: true,
  })),
  buildScopedSchoolFilter: vi.fn((_access, schoolId) => ({
    requestedSchoolId: schoolId || "school-1",
    effectiveSchoolId: schoolId || "school-1",
    role: "manager",
    canSwitchSchool: false,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(async () => ({
        id: "school-1",
        name: "iスクール予備校",
        status: "ACTIVE",
      })),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        id: "setting-1",
        schoolId: "school-1",
        promptSystemRole: "校舎責任者として丁寧に返信してください。",
        promptReviewTone: "丁寧・誠実",
        promptMustKeywords: ["自習室", "大学受験"],
        promptForbiddenWords: ["絶対合格"],
        promptTargetLength: "150-250文字",
        promptAutoReplyApproval: false,
        updatedAt: new Date("2026-09-01T12:00:00.000Z"),
      })),
      upsert: vi.fn(async ({ create, update }) => ({
        id: "setting-1",
        ...create,
        ...update,
        updatedAt: new Date("2026-09-01T13:00:00.000Z"),
      })),
    },
  },
}));

describe("/api/dashboard/settings/prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveRequestAccess).mockResolvedValue({
      access: {
        userId: "manager-1",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "教室長",
        email: "manager@example.com",
        status: "active",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    vi.mocked(buildScopedSchoolFilter).mockImplementation((_access, schoolId) => ({
      requestedSchoolId: schoolId || "school-1",
      effectiveSchoolId: schoolId || "school-1",
      role: "manager",
      canSwitchSchool: false,
    }));
    vi.mocked(prisma.school.findUnique).mockResolvedValue({
      id: "school-1",
      name: "iスクール予備校",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({
      id: "setting-1",
      schoolId: "school-1",
      promptSystemRole: "校舎責任者として丁寧に返信してください。",
      promptReviewTone: "丁寧・誠実",
      promptMustKeywords: ["自習室", "大学受験"],
      promptForbiddenWords: ["絶対合格"],
      promptTargetLength: "150-250文字",
      promptAutoReplyApproval: false,
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    } as never);
  });

  it("returns prompt settings from SchoolSetting using UI-friendly keys", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      setting: {
        schoolId: "school-1",
        systemPrompt: "校舎責任者として丁寧に返信してください。",
        tone: "丁寧・誠実",
        includeKeywords: "自習室, 大学受験",
        ngKeywords: "絶対合格",
        targetLength: "150-250文字",
        autoReplyApproval: false,
        promptMustKeywords: ["自習室", "大学受験"],
      },
    });
  });

  it("saves prompt settings into the existing SchoolSetting columns", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/prompt", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          systemPrompt: "口コミへ温かく返信してください。",
          tone: "丁寧・誠実・保護者目線",
          includeKeywords: "自習室, 個別指導",
          ngKeywords: "100%\n絶対合格",
          targetLength: "160-220文字",
          autoReplyApproval: true,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: {
          promptSystemRole: "口コミへ温かく返信してください。",
          promptReviewTone: "丁寧・誠実・保護者目線",
          promptMustKeywords: ["自習室", "個別指導"],
          promptForbiddenWords: ["100%", "絶対合格"],
          promptTargetLength: "160-220文字",
          promptAutoReplyApproval: true,
        },
      }),
    );
    expect(body.setting).toMatchObject({
      systemPrompt: "口コミへ温かく返信してください。",
      includeKeywords: "自習室, 個別指導",
      ngKeywords: "100%, 絶対合格",
      targetLength: "160-220文字",
      autoReplyApproval: true,
    });
  });

  it("returns default prompt values when the school has no saved settings", async () => {
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      schoolId: "school-1",
      systemPrompt: expect.stringContaining("大学受験専門塾"),
      tone: "丁寧・誠実・保護者目線",
      includeKeywords: "自習室, 個別指導, 大学受験, 逆転合格",
      ngKeywords: "絶対合格, 100%, 最低",
      targetLength: "150-250文字",
      autoReplyApproval: false,
    });
  });

  it("loads prompt settings from legacy databases before new prompt columns are pushed", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce({
        code: "P2022",
        message: "The column SchoolSetting.promptTargetLength does not exist",
      } as never)
      .mockResolvedValueOnce({
        id: "setting-legacy",
        schoolId: "school-1",
        promptSystemRole: "旧カラムのプロンプトです。",
        promptReviewTone: "落ち着いた返信",
        promptMustKeywords: ["個別指導"],
        promptForbiddenWords: ["保証"],
        updatedAt: new Date("2026-09-01T12:00:00.000Z"),
      } as never);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      id: "setting-legacy",
      systemPrompt: "旧カラムのプロンプトです。",
      tone: "落ち着いた返信",
      includeKeywords: "個別指導",
      ngKeywords: "保証",
      targetLength: "150-250文字",
      autoReplyApproval: false,
    });
    consoleErrorSpy.mockRestore();
  });

  it("uses the legacy prompt query when the database reports an unknown column Error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce(new Error("Unknown column promptTargetLength"))
      .mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting).toMatchObject({
      systemPrompt: expect.stringContaining("大学受験専門塾"),
      targetLength: "150-250文字",
    });
    consoleErrorSpy.mockRestore();
  });

  it("uses the legacy prompt query when Prisma reports P2022 as a raw string", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(prisma.schoolSetting.findUnique)
      .mockRejectedValueOnce("P2022: promptAutoReplyApproval does not exist")
      .mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.setting.targetLength).toBe("150-250文字");
    consoleErrorSpy.mockRestore();
  });

  it("allows unauthenticated fallback access through the resolved school scope", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "",
        email: "",
        status: "active",
        source: "fallback",
      },
      isAuthenticated: false,
    });

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );

    expect(response.status).toBe(200);
  });

  it("returns a server error when prompt lookup fails for a non-schema reason", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      message: "プロンプト設定を処理できませんでした。",
    });
    consoleErrorSpy.mockRestore();
  });

  it("rejects pending users and missing or inactive schools with clear statuses", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce({
      access: {
        userId: "pending",
        role: "manager",
        schoolId: "school-1",
        schoolIds: ["school-1"],
        name: "承認待ち",
        email: "pending@example.com",
        status: "pending",
        source: "profiles",
      },
      isAuthenticated: true,
    });
    const pendingResponse = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );

    vi.mocked(buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "all",
      effectiveSchoolId: "",
      role: "admin",
      canSwitchSchool: true,
    });
    const missingSchoolIdResponse = await GET(
      new Request("https://app.example.com/api/dashboard/settings/prompt"),
    );

    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "iスクール予備校",
      status: "ARCHIVED",
    } as never);
    const inactiveSchoolResponse = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );

    expect(pendingResponse.status).toBe(403);
    expect(missingSchoolIdResponse.status).toBe(400);
    expect(inactiveSchoolResponse.status).toBe(404);
  });

  it("returns not found when the selected school row is missing", async () => {
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejects school changes outside the user's scoped school", async () => {
    vi.mocked(buildScopedSchoolFilter).mockReturnValueOnce({
      requestedSchoolId: "school-other",
      effectiveSchoolId: "school-1",
      role: "manager",
      canSwitchSchool: false,
    });

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/prompt", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-other",
          systemPrompt: "保存しない",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe("この校舎のプロンプト設定は変更できません。");
    expect(prisma.schoolSetting.upsert).not.toHaveBeenCalled();
  });

  it("uses the schoolId query parameter when POST body omits schoolId", async () => {
    const response = await POST(
      new Request(
        "https://app.example.com/api/dashboard/settings/prompt?schoolId=school-1",
        {
          method: "POST",
          body: JSON.stringify({
            promptSystemRole: "本文側の既存キーです。",
            promptReviewTone: "落ち着いた返信",
            promptMustKeywords: ["面談"],
            promptForbiddenWords: ["保証"],
            promptTargetLength: "140-180文字",
            promptAutoReplyApproval: false,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(prisma.schoolSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-1" },
        update: expect.objectContaining({
          promptSystemRole: "本文側の既存キーです。",
          promptReviewTone: "落ち着いた返信",
          promptMustKeywords: ["面談"],
          promptForbiddenWords: ["保証"],
          promptTargetLength: "140-180文字",
          promptAutoReplyApproval: false,
        }),
      }),
    );
  });

  it("returns a server error when prompt saving fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(prisma.schoolSetting.upsert).mockRejectedValueOnce(
      new Error("write failed"),
    );

    const response = await POST(
      new Request("https://app.example.com/api/dashboard/settings/prompt", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-1",
          systemPrompt: "保存に失敗する入力です。",
        }),
      }),
    );

    expect(response.status).toBe(500);
    consoleErrorSpy.mockRestore();
  });
});
