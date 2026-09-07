export const CHURN_ALERT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;

export type ChurnAlertStatus = (typeof CHURN_ALERT_STATUSES)[number];

export type ChurnAlertSource = {
  id?: string | null;
  schoolId?: string | null;
  source?: string | null;
  sourceRecordId?: string | null;
  guardianSegment?: string | null;
  studentGrade?: string | null;
  rating?: number | null;
  riskLevel?: string | null;
  category?: string | null;
  status?: string | null;
  reason?: string | null;
  aiActionProposal?: string | null;
  assignedTo?: string | null;
  resolvedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type ChurnAlertView = {
  id: string;
  schoolId: string;
  source: string;
  sourceRecordId: string;
  guardianSegment: string;
  studentGrade: string;
  rating: number | null;
  riskLevel: string;
  category: string;
  status: ChurnAlertStatus;
  statusLabel: string;
  reason: string;
  aiActionProposal: string;
  assignedTo: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return normalizeString(value);
}

function normalizeRating(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(5, Math.max(1, Math.trunc(value)));
}

export function normalizeChurnAlertStatus(value: unknown): ChurnAlertStatus {
  const status = normalizeString(value).toUpperCase();

  if (status === "IN_PROGRESS" || status === "RESOLVED") {
    return status;
  }

  return "OPEN";
}

export function getChurnAlertStatusLabel(status: ChurnAlertStatus) {
  if (status === "RESOLVED") {
    return "解決済";
  }

  if (status === "IN_PROGRESS") {
    return "対応中";
  }

  return "未対応";
}

export function normalizeChurnAlert(alert: ChurnAlertSource): ChurnAlertView {
  const status = normalizeChurnAlertStatus(alert.status);

  return {
    id: normalizeString(alert.id),
    schoolId: normalizeString(alert.schoolId),
    source: normalizeString(alert.source) || "SURVEY",
    sourceRecordId: normalizeString(alert.sourceRecordId),
    guardianSegment: normalizeString(alert.guardianSegment) || "未設定",
    studentGrade: normalizeString(alert.studentGrade) || "未設定",
    rating: normalizeRating(alert.rating),
    riskLevel: normalizeString(alert.riskLevel).toUpperCase() || "MEDIUM",
    category: normalizeString(alert.category) || "未分類",
    status,
    statusLabel: getChurnAlertStatusLabel(status),
    reason: normalizeString(alert.reason),
    aiActionProposal:
      normalizeString(alert.aiActionProposal) ||
      "面談で状況を確認し、学習計画・家庭連絡・授業満足度の改善アクションを記録してください。",
    assignedTo: normalizeString(alert.assignedTo),
    resolvedAt: normalizeDate(alert.resolvedAt) || null,
    createdAt: normalizeDate(alert.createdAt),
    updatedAt: normalizeDate(alert.updatedAt),
  };
}

export function normalizeChurnAlerts(alerts: ChurnAlertSource[] = []) {
  return alerts.map(normalizeChurnAlert).filter((alert) => alert.id);
}

export function buildChurnAlertSummary(alerts: ChurnAlertView[] = []) {
  return {
    totalAlerts: alerts.length,
    openCount: alerts.filter((alert) => alert.status === "OPEN").length,
    inProgressCount: alerts.filter((alert) => alert.status === "IN_PROGRESS").length,
    highRiskCount: alerts.filter((alert) => alert.riskLevel === "HIGH").length,
    resolvedCount: alerts.filter((alert) => alert.status === "RESOLVED").length,
  };
}

export function assertChurnAlertStatus(value: unknown): ChurnAlertStatus {
  const status = normalizeString(value).toUpperCase();

  if (CHURN_ALERT_STATUSES.includes(status as ChurnAlertStatus)) {
    return status as ChurnAlertStatus;
  }

  throw new Error("ステータスは OPEN / IN_PROGRESS / RESOLVED のいずれかを指定してください。");
}
