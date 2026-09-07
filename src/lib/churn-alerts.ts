export const CHURN_ALERT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export const DEFAULT_CHURN_ALERT_SCHOOL_ID = "cms5tnzlr0001jt04qh0lluva";

export type ChurnAlertStatus = (typeof CHURN_ALERT_STATUSES)[number];

export type ChurnAlertSource = {
  id?: string | null;
  schoolId?: string | null;
  source?: string | null;
  sourceType?: string | null;
  sourceRecordId?: string | null;
  guardianSegment?: string | null;
  authorName?: string | null;
  studentGrade?: string | null;
  rating?: number | null;
  riskLevel?: string | null;
  category?: string | null;
  issueCategory?: string | null;
  status?: string | null;
  reason?: string | null;
  content?: string | null;
  aiSummary?: string | null;
  aiActionProposal?: string | null;
  suggestedAction?: string | null;
  assignedTo?: string | null;
  resolvedAt?: Date | string | null;
  detectedAt?: Date | string | null;
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
  risk: string;
  category: string;
  status: ChurnAlertStatus;
  statusLabel: string;
  rawStatus: ChurnAlertStatus;
  reason: string;
  content: string;
  aiActionProposal: string;
  aiAdvice: string;
  parentType: string;
  assignedTo: string;
  resolvedAt: string | null;
  detectedAt: string;
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
  const rawStatus = normalizeString(value);
  const status = rawStatus.toUpperCase();

  if (status === "IN_PROGRESS" || status === "RESOLVED") {
    return status;
  }

  if (rawStatus === "対応中") {
    return "IN_PROGRESS";
  }

  if (rawStatus === "解決済" || rawStatus === "完了") {
    return "RESOLVED";
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

function getRiskLabel(riskLevel: string) {
  if (riskLevel === "HIGH") {
    return "高リスク";
  }

  if (riskLevel === "LOW") {
    return "低リスク";
  }

  return "中リスク";
}

export function normalizeChurnAlert(alert: ChurnAlertSource): ChurnAlertView {
  const status = normalizeChurnAlertStatus(alert.status);
  const riskLevel = normalizeString(alert.riskLevel).toUpperCase() || "MEDIUM";
  const category =
    normalizeString(alert.issueCategory) ||
    normalizeString(alert.category) ||
    "未分類";
  const content =
    normalizeString(alert.content) ||
    normalizeString(alert.reason) ||
    normalizeString(alert.aiSummary);
  const aiAdvice =
    normalizeString(alert.suggestedAction) ||
    normalizeString(alert.aiActionProposal) ||
    normalizeString(alert.aiSummary) ||
    "個別ヒアリングを行い、学習計画・家庭連絡・授業満足度の改善アクションを記録してください。";
  const createdAt = normalizeDate(alert.createdAt);

  return {
    id: normalizeString(alert.id),
    schoolId: normalizeString(alert.schoolId),
    source: normalizeString(alert.sourceType) || normalizeString(alert.source) || "SURVEY",
    sourceRecordId: normalizeString(alert.sourceRecordId),
    guardianSegment:
      normalizeString(alert.guardianSegment) ||
      normalizeString(alert.authorName) ||
      "未設定",
    studentGrade: normalizeString(alert.studentGrade) || "未設定",
    rating: normalizeRating(alert.rating),
    riskLevel,
    risk: getRiskLabel(riskLevel),
    category,
    status,
    statusLabel: getChurnAlertStatusLabel(status),
    rawStatus: status,
    reason: content,
    content,
    aiActionProposal: aiAdvice,
    aiAdvice,
    parentType:
      normalizeString(alert.authorName) ||
      normalizeString(alert.guardianSegment) ||
      "保護者",
    assignedTo: normalizeString(alert.assignedTo),
    resolvedAt: normalizeDate(alert.resolvedAt) || null,
    detectedAt: normalizeDate(alert.detectedAt) || createdAt,
    createdAt,
    updatedAt: normalizeDate(alert.updatedAt),
  };
}

export function normalizeChurnAlerts(alerts: ChurnAlertSource[] = []) {
  return alerts.map(normalizeChurnAlert).filter((alert) => alert.id);
}

export function buildChurnAlertSummary(alerts: ChurnAlertView[] = []) {
  const total = alerts.length;

  return {
    total,
    totalAlerts: total,
    openCount: alerts.filter((alert) => alert.status === "OPEN").length,
    inProgressCount: alerts.filter((alert) => alert.status === "IN_PROGRESS").length,
    highRiskCount: alerts.filter((alert) => alert.riskLevel === "HIGH").length,
    resolvedCount: alerts.filter((alert) => alert.status === "RESOLVED").length,
  };
}

export function buildDefaultChurnAlerts(
  schoolId = DEFAULT_CHURN_ALERT_SCHOOL_ID,
  now = new Date(),
) {
  return normalizeChurnAlerts([
    {
      id: "alert_001",
      schoolId,
      sourceType: "SURVEY",
      authorName: "高3保護者（下通校）",
      rating: 2,
      riskLevel: "HIGH",
      issueCategory: "指導品質",
      content:
        "夏期講習に入ってから質問対応の順番待ちが長く、自習が進まないと本人が言っています。",
      aiSummary:
        "質問対応のキャパシティ不足による学習停滞の不満。受験直前期のため退塾リスク高。",
      suggestedAction:
        "担当チューターより本日中に学習進捗のヒアリング面談を実施。質問予約枠の優先確保を提案。",
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "alert_002",
      schoolId,
      sourceType: "SURVEY",
      authorName: "高2生徒（通町筋）",
      rating: 3,
      riskLevel: "MEDIUM",
      issueCategory: "設備・環境",
      content: "自習室の空調が少し寒くて集中しづらい日があります。",
      aiSummary: "自習室環境への軽微な不満。学習意欲はあるが利用頻度低下の懸念。",
      suggestedAction:
        "自習室内の温度設定確認（26℃目安）およびブランケット貸出の案内を全体周知。",
      status: "RESOLVED",
      createdAt: new Date(now.getTime() - 86_400_000),
      updatedAt: new Date(now.getTime() - 86_400_000),
    },
  ]);
}

export function assertChurnAlertStatus(value: unknown): ChurnAlertStatus {
  const status = normalizeString(value).toUpperCase();

  if (CHURN_ALERT_STATUSES.includes(status as ChurnAlertStatus)) {
    return status as ChurnAlertStatus;
  }

  throw new Error("ステータスは OPEN / IN_PROGRESS / RESOLVED のいずれかを指定してください。");
}
