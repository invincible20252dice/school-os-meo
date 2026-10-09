export const leadChannels = { line: "LINE", phone: "電話", web: "Web", other: "その他" } as const;
export const leadGrades = { elementary: "小学生", junior_high: "中学生", high_school: "高校生", other: "その他" } as const;
export const leadStatuses = { inquiry: "問い合わせ", meeting: "面談", lost: "見送り" } as const;
export type LeadChannel = keyof typeof leadChannels;
export type LeadGrade = keyof typeof leadGrades;
export type LeadStatus = keyof typeof leadStatuses;
export class LeadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function leadObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LeadError("入力内容を確認してください。");
  return value as Record<string, unknown>;
}
export function leadChoice<T extends string>(value: unknown, choices: Record<T, string>): T {
  if (typeof value !== "string" || !Object.hasOwn(choices, value)) throw new LeadError("選択内容を確認してください。");
  return value as T;
}
export function leadId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new LeadError("対象の記録を確認してください。");
  return value;
}
export function leadVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new LeadError("記録を再取得してください。");
  return Number(value);
}
export const jstDay = (date: Date) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const jstMonth = (date: Date) => jstDay(date).slice(0, 7);
export function monthOffset(month: string, offset: number) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export const monthStart = (month: string) => new Date(`${month}-01T00:00:00+09:00`);
export function leadPeriod(period: string, now = new Date()) {
  if (!["month", "previous", "six"].includes(period)) throw new LeadError("期間を選択してください。");
  const current = jstMonth(now);
  const month = period === "previous" ? monthOffset(current, -1) : current;
  const first = period === "six" ? monthOffset(current, -5) : month;
  return { period, month, first, from: monthStart(first), to: period === "previous" ? monthStart(current) : now,
    trendFrom: monthStart(monthOffset(current, -5)), current, previous: monthOffset(current, -1) };
}
export function parseLeadEdit(body: Record<string, unknown>, now: Date) {
  const edit: { channel?: LeadChannel; grade?: LeadGrade | null; status?: LeadStatus; occurredAt?: Date } = {};
  if (body.channel !== undefined) edit.channel = leadChoice(body.channel, leadChannels);
  if (body.grade !== undefined) edit.grade = body.grade === null ? null : leadChoice(body.grade, leadGrades);
  if (body.status !== undefined) edit.status = leadChoice(body.status, leadStatuses);
  if (body.occurredAt !== undefined) {
    if (typeof body.occurredAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(body.occurredAt)) throw new LeadError("問い合わせ日時を確認してください。");
    const [datePart, timePart] = body.occurredAt.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > lastDay || Number(timePart.slice(0, 2)) > 23) throw new LeadError("問い合わせ日時を確認してください。");
    const date = new Date(body.occurredAt);
    if (!Number.isFinite(date.getTime()) || date > now || date < new Date("2000-01-01")) throw new LeadError("問い合わせ日時を確認してください。");
    edit.occurredAt = date;
  }
  if (!Object.keys(edit).length) throw new LeadError("変更内容がありません。");
  return edit;
}
export type LeadFact = { source: string; status: string; channel: string; occurredAt: Date; meetingAt: Date | null; deletedAt: Date | null };
export function aggregateLeads(rows: LeadFact[], period: ReturnType<typeof leadPeriod>) {
  const valid = rows.filter(row => row.source === "google" && !row.deletedAt);
  const within = (date: Date | null, from: Date, to: Date) => date !== null && date >= from && date < to;
  const inquiries = valid.filter(row => within(row.occurredAt, period.from, period.to));
  const meetings = valid.filter(row => row.status === "meeting" && within(row.meetingAt, period.from, period.to));
  const converted = inquiries.filter(row => row.status === "meeting").length;
  const monthMeetings = (month: string) => valid.filter(row => row.status === "meeting" && within(row.meetingAt, monthStart(month), monthStart(monthOffset(month, 1)))).length;
  const currentMeetings = monthMeetings(period.current), previousMeetings = monthMeetings(period.previous);
  return { inquiriesCount: inquiries.length, meetingsCount: meetings.length, convertedCount: converted,
    meetingRate: inquiries.length ? Math.round(converted / inquiries.length * 1000) / 10 : null,
    currentMeetings, previousMeetings, meetingDiff: currentMeetings - previousMeetings,
    channelBreakdown: Object.entries(leadChannels).map(([channel, label]) => ({ channel, label, count: inquiries.filter(row => row.channel === channel).length })),
    monthlyTrend: Array.from({ length: 6 }, (_, i) => {
      const month = monthOffset(period.current, i - 5);
      return { month, inquiries: valid.filter(row => within(row.occurredAt, monthStart(month), monthStart(monthOffset(month, 1)))).length, meetings: monthMeetings(month) };
    }) };
}
