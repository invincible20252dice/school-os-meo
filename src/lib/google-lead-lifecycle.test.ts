import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { advanceLeadStage, aggregateLeadLifecycle, leadStage, leadStageChoices } from "./google-lead-lifecycle";
import { leadPeriod, type LeadFact } from "./google-leads";
const occurredAt = new Date("2026-10-01T00:00:00Z"), scheduled = new Date("2026-10-02T00:00:00Z"), held = new Date("2026-10-03T00:00:00Z"), enrolled = new Date("2026-10-04T00:00:00Z");
const row = { status: "inquiry", occurredAt, meetingScheduledAt: null, meetingHeldAt: null, enrolledAt: null };
it("advances only explicit confirmations and never reclassifies old meeting records", () => {
  expect(leadStage(row)).toBe("inquiry");
  expect(leadStage({ status: "meeting" })).toBe("legacy_meeting");
  const planned = { ...row, ...advanceLeadStage(row, "scheduled", scheduled) };
  expect(leadStage(planned)).toBe("scheduled");
  const done = { ...planned, ...advanceLeadStage(planned, "held", held) };
  expect(leadStage(done)).toBe("held");
  const joined = { ...done, ...advanceLeadStage(done, "enrolled", enrolled) };
  expect(leadStage(joined)).toBe("enrolled");
  expect(joined).toMatchObject({ meetingScheduledAt: scheduled, meetingHeldAt: held, enrolledAt: enrolled });
  expect(() => advanceLeadStage(joined, "lost", enrolled)).toThrow("退塾");
  const lost = { ...done, ...advanceLeadStage(done, "lost", enrolled) };
  expect(leadStage(lost)).toBe("lost");
  expect(lost.meetingHeldAt).toEqual(held);
  expect(advanceLeadStage(joined, "inquiry", enrolled)).toEqual({ status: "inquiry", meetingScheduledAt: null, meetingHeldAt: null, enrolledAt: null });
  expect(advanceLeadStage({ ...row, status: "meeting" }, "held", held)).toEqual({ status: "meeting", meetingHeldAt: held });
  expect(advanceLeadStage({ ...row, status: "meeting" }, "scheduled", scheduled)).toEqual({ status: "meeting", meetingScheduledAt: scheduled });
  for (const value of [row, planned, done, joined, lost, { status: "meeting" }]) expect(leadStageChoices(value)).toContain(leadStage(value));
});
it.each(["held", "enrolled", "legacy_meeting", "bad", null])("rejects skipped or invalid target %s", target => {
  expect(() => advanceLeadStage(row, target, held)).toThrow();
});
it("rejects duplicate confirmation and reverse timestamps", () => {
  expect(() => advanceLeadStage(row, "inquiry", held)).toThrow("記録済み");
  expect(() => advanceLeadStage(row, "scheduled", new Date("2026-09-01"))).toThrow("日時");
  expect(() => advanceLeadStage({ ...row, status: "meeting", meetingScheduledAt: enrolled }, "held", held)).toThrow("日時");
});
it("counts confirmed events and cohorts separately, preserving held facts after loss", () => {
  const base: LeadFact = { ...row, source: "google", channel: "line", meetingAt: scheduled, deletedAt: null };
  const facts = [
    { ...base, status: "meeting", meetingScheduledAt: scheduled, meetingHeldAt: held, enrolledAt: enrolled },
    { ...base, status: "lost", meetingScheduledAt: scheduled, meetingHeldAt: held },
    { ...base, status: "meeting" },
    { ...base, source: "other", meetingHeldAt: held },
    { ...base, deletedAt: enrolled, meetingHeldAt: held },
  ];
  const data = aggregateLeadLifecycle(facts, leadPeriod("month", new Date("2026-10-05")));
  expect(data).toMatchObject({ scheduledCount: 2, heldCount: 2, enrolledCount: 1, legacyMeetingCount: 1, cohortHeldCount: 2, cohortEnrolledCount: 1, heldRate: 66.7, enrollmentRate: 33.3 });
  expect(data.monthlyTrend.at(-1)).toEqual({ month: "2026-10", inquiries: 3, scheduled: 2, held: 2, enrolled: 1 });
  expect(aggregateLeadLifecycle([], leadPeriod("month", enrolled))).toMatchObject({ heldRate: null, enrollmentRate: null });
  expect(aggregateLeadLifecycle(facts, leadPeriod("month", enrolled))).toMatchObject({ enrolledCount: 0, cohortEnrolledCount: 0 });
  const old = [{ ...base, occurredAt: new Date("2025-01-01"), status: "meeting", meetingHeldAt: held }];
  expect(aggregateLeadLifecycle(old, leadPeriod("month", enrolled))).toMatchObject({ heldCount: 1, cohortHeldCount: 0, heldRate: null });
});
it("applies the additive SQL without rewriting legacy data, keeps old writes working and enforces dates", async () => {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE TABLE "School" (id TEXT PRIMARY KEY); INSERT INTO "School" VALUES (\'a\'); CREATE TABLE "GbpMetric" (id TEXT);');
    await db.exec(readFileSync("prisma/migrations/20261003030000_add_google_leads/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "GoogleLead" (id,"schoolId",channel,status,"occurredAt","meetingAt","idempotencyKey","updatedAt") VALUES ('legacy','a','line','meeting','2026-10-01','2026-10-02','original','2026-10-02')`);
    const before = (await db.query('SELECT row_to_json(g) AS row FROM "GoogleLead" g')).rows;
    await db.exec(readFileSync("supabase/migrations/20261009104049_google_lead_lifecycle.sql", "utf8"));
    const after = (await db.query('SELECT to_jsonb(g) - ARRAY[\'meetingScheduledAt\',\'meetingHeldAt\',\'enrolledAt\'] AS row FROM "GoogleLead" g')).rows;
    expect(after).toEqual(before);
    expect((await db.query('SELECT "meetingScheduledAt","meetingHeldAt","enrolledAt" FROM "GoogleLead"')).rows).toEqual([{ meetingScheduledAt: null, meetingHeldAt: null, enrolledAt: null }]);
    await db.exec(`UPDATE "GoogleLead" SET status='lost',"meetingAt"=NULL,"closedAt"='2026-10-03',version=version+1 WHERE id='legacy'`);
    await expect(db.exec(`UPDATE "GoogleLead" SET "enrolledAt"='2026-10-03'`)).rejects.toThrow();
    await expect(db.exec(`UPDATE "GoogleLead" SET "meetingScheduledAt"='2026-09-30'`)).rejects.toThrow();
    await expect(db.exec(`UPDATE "GoogleLead" SET "meetingHeldAt"='2026-09-30'`)).rejects.toThrow();
    await db.exec(`UPDATE "GoogleLead" SET "meetingScheduledAt"='2026-10-02',"meetingHeldAt"='2026-10-03',"enrolledAt"='2026-10-04'`);
    await expect(db.exec(`UPDATE "GoogleLead" SET "meetingScheduledAt"='2026-10-05'`)).rejects.toThrow();
    await expect(db.exec(`UPDATE "GoogleLead" SET "enrolledAt"='2026-10-02'`)).rejects.toThrow();
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='GoogleLead'`)).rows).toEqual([{ relrowsecurity: true }]);
  } finally { await db.close(); }
}, 30000);
