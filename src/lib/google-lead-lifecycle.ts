import { LeadError, leadChoice, monthOffset, monthStart, type LeadFact, type leadPeriod } from "./google-leads";

export const leadStages = { inquiry: "問い合わせ", scheduled: "面談予定", held: "面談実施", enrolled: "入塾", lost: "見送り" } as const;
export type LeadStage = keyof typeof leadStages | "legacy_meeting";
export const leadStageLabels = { ...leadStages, legacy_meeting: "旧面談・予定/実施未確認" };
type Milestones = { meetingScheduledAt?: Date | null; meetingHeldAt?: Date | null; enrolledAt?: Date | null };
export function leadStage(row: { status: string; meetingScheduledAt?: unknown; meetingHeldAt?: unknown; enrolledAt?: unknown }): LeadStage {
  if (row.status === "lost") return "lost";
  if (row.status !== "meeting") return "inquiry";
  if (row.enrolledAt) return "enrolled";
  if (row.meetingHeldAt) return "held";
  if (row.meetingScheduledAt) return "scheduled";
  return "legacy_meeting";
}
export function leadStageChoices(row: Parameters<typeof leadStage>[0]): LeadStage[] {
  const current = leadStage(row);
  const choices: Record<LeadStage, LeadStage[]> = {
    inquiry: ["inquiry", "scheduled", "lost"], scheduled: ["scheduled", "held", "inquiry", "lost"],
    held: ["held", "enrolled", "inquiry", "lost"], enrolled: ["enrolled", "inquiry"],
    legacy_meeting: ["legacy_meeting", "scheduled", "held", "inquiry", "lost"], lost: ["lost", "inquiry"],
  };
  return choices[current];
}
export function advanceLeadStage(row: { status: string; occurredAt: Date } & Milestones, value: unknown, now: Date) {
  const next = leadChoice(value, leadStages), current = leadStage(row);
  if (next === current) throw new LeadError("この段階は記録済みです。再取得してください。", 409);
  if (next === "inquiry") return { status: "inquiry", meetingScheduledAt: null, meetingHeldAt: null, enrolledAt: null };
  if (next === "lost") {
    if (current === "enrolled") throw new LeadError("入塾後の退塾管理はこの画面の対象外です。");
    return { status: "lost" };
  }
  const allowed = { scheduled: ["inquiry", "legacy_meeting"], held: ["scheduled", "legacy_meeting"], enrolled: ["held"] };
  if (!allowed[next].includes(current)) throw new LeadError("問い合わせ、面談予定、面談実施、入塾の順に確認してください。");
  if ([row.occurredAt, row.meetingScheduledAt, row.meetingHeldAt].some(date => date && date > now)) throw new LeadError("記録日時を確認してください。");
  if (next === "scheduled") return { status: "meeting", meetingScheduledAt: now };
  if (next === "held") return { status: "meeting", meetingHeldAt: now };
  return { status: "meeting", enrolledAt: now };
}
export function aggregateLeadLifecycle(rows: Array<LeadFact & Milestones>, period: ReturnType<typeof leadPeriod>) {
  const valid = rows.filter(row => row.source === "google" && !row.deletedAt);
  const within = (date: Date | null | undefined, from = period.from, to = period.to) => !!date && date >= from && date < to;
  const cohort = valid.filter(row => within(row.occurredAt));
  const confirmed = (date: Date | null | undefined) => !!date && date < period.to;
  const cohortHeldCount = cohort.filter(row => confirmed(row.meetingHeldAt)).length;
  const cohortEnrolledCount = cohort.filter(row => confirmed(row.enrolledAt)).length;
  const rate = (count: number) => cohort.length ? Math.round(count / cohort.length * 1000) / 10 : null;
  return {
    scheduledCount: valid.filter(row => within(row.meetingScheduledAt)).length,
    heldCount: valid.filter(row => within(row.meetingHeldAt)).length,
    enrolledCount: valid.filter(row => within(row.enrolledAt)).length,
    legacyMeetingCount: valid.filter(row => leadStage(row) === "legacy_meeting" && within(row.meetingAt)).length,
    cohortHeldCount, cohortEnrolledCount, heldRate: rate(cohortHeldCount), enrollmentRate: rate(cohortEnrolledCount),
    monthlyTrend: Array.from({ length: 6 }, (_, i) => {
      const month = monthOffset(period.current, i - 5), from = monthStart(month), to = monthStart(monthOffset(month, 1));
      return { month, inquiries: valid.filter(row => within(row.occurredAt, from, to)).length,
        scheduled: valid.filter(row => within(row.meetingScheduledAt, from, to)).length,
        held: valid.filter(row => within(row.meetingHeldAt, from, to)).length,
        enrolled: valid.filter(row => within(row.enrolledAt, from, to)).length };
    }),
  };
}
