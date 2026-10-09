import type { AioUsage } from "./aio-audit";
import type { SavedAioCompetitor } from "./aio-context";
export type MeasurementView = {
  id: string; status: string; query: string; response: string | null;
  brandDetected: boolean | null; recommended: boolean | null; score: number | null;
  measuredAt: string | null; createdAt: string; model: string; errorCode: string | null;
  evidence: string | null; citations: Array<{ url: string; title: string }> | null;
  schoolName?: string; usage?: AioUsage | null;
};
export type AioViewData = {
  configured: boolean; pilotKeywordId: string | null; canMeasure: boolean;
  school?: { name: string; prefecture: string | null; city: string | null; addressLine: string | null; websiteUrl: string | null; schoolSetting: { googleConnected: boolean } | null } | null;
  competitors?: SavedAioCompetitor[];
  keywords: Array<{ id: string; keyword: string; municipality: string; nearestStation: string; latest: MeasurementView | null; history?: MeasurementView[]; historyTruncated?: boolean }>;
};
export function measurementState(record: MeasurementView | null, configured: boolean, now = Date.now()) {
  if (!record) return { label: configured ? "未計測" : "設定が必要", value: "—" };
  if (record.status === "SUCCESS" && record.recommended !== null && record.brandDetected !== null && record.measuredAt && record.score !== null) return { label: "計測成功", value: record.recommended ? "100%" : "0%" };
  if (record.status === "CONFIG_REQUIRED") return { label: "設定が必要", value: "—" };
  if (record.status === "RUNNING" && now - new Date(record.createdAt).getTime() < 300_000) return { label: "計測中", value: "—" };
  return { label: "計測失敗", value: "—" };
}
