// Only bounded machine states cross the logging/UI boundary; never error bodies.
const stages = ["SETTINGS", "CONFIG", "OAUTH", "SCOPE", "GOOGLE_API", "TRANSFORM", "DB_READ", "DB_SAVE", "FETCHED"] as const;
export type GoogleDiagnostic = { stage: typeof stages[number] | "UNKNOWN"; httpStatus: number | null };
export function googleDiagnostic(value: unknown): GoogleDiagnostic {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    stage: stages.includes(row.stage as typeof stages[number]) ? row.stage as typeof stages[number] : "UNKNOWN",
    httpStatus: typeof row.httpStatus === "number" && Number.isInteger(row.httpStatus) && row.httpStatus >= 100 && row.httpStatus <= 599 ? row.httpStatus : null,
  };
}
export function googleFailureDetail(value: unknown) {
  const d = googleDiagnostic(value);
  const labels: Record<GoogleDiagnostic["stage"], string> = {
    SETTINGS: "連携設定の取得", CONFIG: "取得設定の確認", OAUTH: "認証情報の更新", SCOPE: "必要な権限の確認",
    GOOGLE_API: "Google APIへの取得要求", TRANSFORM: "取得データの確認", DB_READ: "保存データの取得", DB_SAVE: "取得結果の保存", FETCHED: "取得後の確認", UNKNOWN: "取得処理",
  };
  return `${labels[d.stage]}で失敗しました（${d.httpStatus === null ? "HTTP状態は未確認" : `HTTP ${d.httpStatus}`}）。検索需要は情報不足のため未判定です。`;
}
