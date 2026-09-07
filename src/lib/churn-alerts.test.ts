import { describe, expect, it } from "vitest";
import {
  assertChurnAlertStatus,
  buildDefaultChurnAlerts,
  buildChurnAlertSummary,
  getChurnAlertStatusLabel,
  normalizeChurnAlerts,
  normalizeChurnAlertStatus,
} from "./churn-alerts";

describe("churn-alerts", () => {
  it("normalizes churn alert rows for dashboard display", () => {
    const alerts = normalizeChurnAlerts([
      {
        id: "alert-1",
        schoolId: "school-1",
        source: "SURVEY",
        sourceType: "GOOGLE",
        sourceRecordId: "response-1",
        guardianSegment: "高2 保護者",
        authorName: "高2 保護者（下通校）",
        studentGrade: "高校2年",
        rating: 2.8,
        riskLevel: "high",
        category: "面談不足",
        issueCategory: "質問対応",
        status: "in_progress",
        reason: "質問対応に不安",
        content: "自習中の質問対応を増やしてほしい",
        aiSummary: "質問対応への不安が強い",
        aiActionProposal: "24時間以内に面談を設定する",
        suggestedAction: "本日中に教室長から連絡する",
        assignedTo: "教室長",
        resolvedAt: null,
        detectedAt: "2026-08-22T06:45:00.000Z",
        createdAt: new Date("2026-08-22T06:46:00.000Z"),
        updatedAt: new Date("2026-08-22T06:46:00.000Z"),
      },
      {
        id: "",
        category: "invalid",
      },
    ]);

    expect(alerts).toEqual([
      {
        id: "alert-1",
        schoolId: "school-1",
        source: "GOOGLE",
        sourceRecordId: "response-1",
        guardianSegment: "高2 保護者",
        studentGrade: "高校2年",
        rating: 2,
        riskLevel: "HIGH",
        risk: "高リスク",
        category: "質問対応",
        status: "IN_PROGRESS",
        statusLabel: "対応中",
        rawStatus: "IN_PROGRESS",
        reason: "自習中の質問対応を増やしてほしい",
        content: "自習中の質問対応を増やしてほしい",
        aiActionProposal: "本日中に教室長から連絡する",
        aiAdvice: "本日中に教室長から連絡する",
        parentType: "高2 保護者（下通校）",
        assignedTo: "教室長",
        resolvedAt: null,
        detectedAt: "2026-08-22T06:45:00.000Z",
        createdAt: "2026-08-22T06:46:00.000Z",
        updatedAt: "2026-08-22T06:46:00.000Z",
      },
    ]);
  });

  it("builds summary counts by status and risk level", () => {
    const alerts = normalizeChurnAlerts([
      { id: "a1", riskLevel: "HIGH", category: "低評価", status: "OPEN" },
      { id: "a2", riskLevel: "MEDIUM", category: "欠席増加", status: "IN_PROGRESS" },
      { id: "a3", riskLevel: "HIGH", category: "面談不足", status: "RESOLVED" },
    ]);

    expect(buildChurnAlertSummary(alerts)).toEqual({
      total: 3,
      totalAlerts: 3,
      openCount: 1,
      inProgressCount: 1,
      highRiskCount: 2,
      resolvedCount: 1,
    });
  });

  it("normalizes and validates statuses", () => {
    expect(normalizeChurnAlertStatus("resolved")).toBe("RESOLVED");
    expect(normalizeChurnAlertStatus("対応中")).toBe("IN_PROGRESS");
    expect(normalizeChurnAlertStatus("解決済")).toBe("RESOLVED");
    expect(normalizeChurnAlertStatus("working")).toBe("OPEN");
    expect(getChurnAlertStatusLabel("OPEN")).toBe("未対応");
    expect(getChurnAlertStatusLabel("RESOLVED")).toBe("解決済");
    expect(assertChurnAlertStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(() => assertChurnAlertStatus("DONE")).toThrow("ステータス");
  });

  it("fills display defaults for sparse alert rows", () => {
    expect(normalizeChurnAlerts([
      {
        id: "alert-blank",
        rating: 99,
        category: "",
        createdAt: "invalid-date",
        updatedAt: "",
      },
    ])[0]).toMatchObject({
      guardianSegment: "未設定",
      studentGrade: "未設定",
      rating: 5,
      riskLevel: "MEDIUM",
      risk: "中リスク",
      category: "未分類",
      status: "OPEN",
      statusLabel: "未対応",
      rawStatus: "OPEN",
      createdAt: "invalid-date",
    });
  });

  it("builds default churn alerts with the frontend contract fields", () => {
    const alerts = buildDefaultChurnAlerts(
      "school-1",
      new Date("2026-08-22T06:46:00.000Z"),
    );

    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      id: "alert_001",
      schoolId: "school-1",
      risk: "高リスク",
      parentType: "高3保護者（下通校）",
      category: "指導品質",
      status: "OPEN",
      rawStatus: "OPEN",
      aiAdvice: "担当チューターより本日中に学習進捗のヒアリング面談を実施。質問予約枠の優先確保を提案。",
    });
    expect(buildChurnAlertSummary(alerts)).toMatchObject({
      total: 2,
      totalAlerts: 2,
      openCount: 1,
      highRiskCount: 1,
      resolvedCount: 1,
    });
  });
});
