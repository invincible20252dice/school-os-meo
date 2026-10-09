import { prisma } from "./prisma";
import { advanceLeadStage, aggregateLeadLifecycle } from "./google-lead-lifecycle";
import { aggregateLeads, LeadError, leadChannels, leadChoice, leadId, leadPeriod, leadVersion, parseLeadEdit } from "./google-leads";

export async function loadGoogleLeads(schoolId: string, periodName: string, now = new Date()) {
  const period = leadPeriod(periodName, now);
  const where = { schoolId, source: "google", deletedAt: null };
  const rows = await prisma.googleLead.findMany({ where: { ...where, OR: [{ occurredAt: { gte: period.trendFrom, lt: now } }, { meetingAt: { gte: period.trendFrom, lt: now } }, ...["meetingScheduledAt", "meetingHeldAt", "enrolledAt"].map(field => ({ [field]: { gte: period.trendFrom, lt: now } }))] },
    select: { source: true, status: true, channel: true, occurredAt: true, meetingAt: true, meetingScheduledAt: true, meetingHeldAt: true, enrolledAt: true, deletedAt: true } });
  const recent = await prisma.googleLead.findMany({ where: { ...where, occurredAt: { gte: period.from, lt: period.to } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 20 });
  return { period: { name: periodName, from: period.from.toISOString(), to: period.to.toISOString() }, ...aggregateLeads(rows, period), lifecycle: aggregateLeadLifecycle(rows, period), recent };
}
export async function createGoogleLead(schoolId: string, body: Record<string, unknown>, now = new Date()) {
  const channel = leadChoice(body.channel, leadChannels), idempotencyKey = leadId(body.idempotencyKey);
  const row = await prisma.googleLead.upsert({ where: { schoolId_idempotencyKey: { schoolId, idempotencyKey } }, update: {},
    create: { schoolId, channel, idempotencyKey, occurredAt: now } });
  if (row.channel !== channel || row.deletedAt) throw new LeadError("この登録は処理済みです。最新の一覧を確認してください。", 409);
  return row;
}
export async function changeGoogleLead(schoolId: string, body: Record<string, unknown>, remove: boolean, now = new Date()) {
  const id = leadId(body.id), version = leadVersion(body.version);
  const row = await prisma.googleLead.findFirst({ where: { schoolId, id, deletedAt: null } });
  if (!row) throw new LeadError("対象の記録が見つかりません。", 404);
  if (row.version !== version) throw new LeadError("別の更新が保存されています。再取得してください。", 409);
  if (!remove && body.stage !== undefined && body.status !== undefined) throw new LeadError("段階と旧状態を同時に指定できません。");
  const hasMetadata = ["channel", "grade", "status", "occurredAt"].some(field => body[field] !== undefined);
  const edit = remove ? {} : {
    ...(hasMetadata || body.stage === undefined ? parseLeadEdit(body, now) : {}),
    ...(body.status === "inquiry" ? { meetingScheduledAt: null, meetingHeldAt: null, enrolledAt: null } : {}),
    ...(body.stage === undefined ? {} : advanceLeadStage(row, body.stage, now)),
  };
  const nextStatus = edit.status ?? row.status;
  const meetingAt = nextStatus === "meeting" ? row.meetingAt ?? now : null;
  if ([meetingAt, ...(["meetingScheduledAt", "meetingHeldAt", "enrolledAt"] as const).map(field => field in edit ? edit[field] : row[field])].some(date => date && (edit.occurredAt ?? row.occurredAt) > date)) throw new LeadError("問い合わせ日時は面談になった日時以前にしてください。");
  const result = await prisma.googleLead.updateMany({ where: { schoolId, id, version, deletedAt: null },
    data: remove ? { deletedAt: now, version: { increment: 1 } } : { ...edit, meetingAt, closedAt: nextStatus === "lost" ? row.closedAt ?? now : null, version: { increment: 1 } } });
  if (result.count !== 1) throw new LeadError("同時更新を検出しました。再取得してください。", 409);
  return { id };
}
