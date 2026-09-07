import { describe, expect, it } from "vitest";
import {
  assertChurnAlertStatus,
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
        sourceRecordId: "response-1",
        guardianSegment: "高2 保護者",
        studentGrade: "高校2年",
        rating: 2.8,
        riskLevel: "high",
        category: "面談不足",
        status: "in_progress",
        reason: "質問対応に不安",
        aiActionProposal: "24時間以内に面談を設定する",
        assignedTo: "教室長",
        resolvedAt: null,
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
        source: "SURVEY",
        sourceRecordId: "response-1",
        guardianSegment: "高2 保護者",
        studentGrade: "高校2年",
        rating: 2,
        riskLevel: "HIGH",
        category: "面談不足",
        status: "IN_PROGRESS",
        statusLabel: "対応中",
        reason: "質問対応に不安",
        aiActionProposal: "24時間以内に面談を設定する",
        assignedTo: "教室長",
        resolvedAt: null,
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
      totalAlerts: 3,
      openCount: 1,
      inProgressCount: 1,
      highRiskCount: 2,
      resolvedCount: 1,
    });
  });

  it("normalizes and validates statuses", () => {
    expect(normalizeChurnAlertStatus("resolved")).toBe("RESOLVED");
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
      category: "未分類",
      status: "OPEN",
      statusLabel: "未対応",
      createdAt: "invalid-date",
    });
  });
});
