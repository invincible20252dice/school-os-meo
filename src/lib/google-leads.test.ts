import { describe, expect, it } from "vitest";
import { aggregateLeads, jstDay, leadChoice, leadId, leadObject, leadPeriod, leadVersion, monthOffset, parseLeadEdit, type LeadFact } from "./google-leads";
const now = new Date("2026-10-03T12:00:00Z");
const fact = (overrides: Partial<LeadFact> = {}): LeadFact => ({ source: "google", status: "inquiry", channel: "line", occurredAt: new Date("2026-10-01T00:00:00+09:00"), meetingAt: null, deletedAt: null, ...overrides });
describe("Google lead reporting and validation", () => {
  it("counts 8 real inquiries, 5 meetings and 62.5%, keeping lost in the denominator", () => {
    const rows = Array.from({ length: 8 }, (_, i) => fact({ status: i < 5 ? "meeting" : i === 5 ? "lost" : "inquiry", meetingAt: i < 5 ? now : null, channel: i < 3 ? "phone" : "line" }));
    rows.forEach(r => { if (r.meetingAt) r.meetingAt = new Date(now.getTime() - 1); });
    const data = aggregateLeads([...rows, fact({ deletedAt: now }), fact({ source: "instagram" })], leadPeriod("month", now));
    expect(data).toMatchObject({ inquiriesCount: 8, meetingsCount: 5, convertedCount: 5, meetingRate: 62.5 });
    expect(data.channelBreakdown.map(x => x.count)).toEqual([5, 3, 0, 0]);
  });
  it("separates month-of-inquiry cohort from month-of-meeting, across JST boundary", () => {
    const rows = [
      fact({ occurredAt: new Date("2026-09-30T14:59:59Z"), status: "meeting", meetingAt: new Date("2026-10-01T00:00:00Z") }),
      fact({ occurredAt: new Date("2026-09-30T15:00:00Z") }),
      ...Array.from({ length: 3 }, () => fact({ occurredAt: new Date("2026-09-01T00:00:00Z"), status: "meeting", meetingAt: new Date("2026-09-15T00:00:00Z") })),
      ...Array.from({ length: 4 }, () => fact({ status: "meeting", meetingAt: new Date("2026-10-02T00:00:00Z") })),
    ];
    const current = aggregateLeads(rows, leadPeriod("month", now));
    expect(current).toMatchObject({ inquiriesCount: 5, meetingsCount: 5, meetingRate: 80, previousMeetings: 3, currentMeetings: 5, meetingDiff: 2 });
    const previous = aggregateLeads(rows, leadPeriod("previous", now));
    expect(previous).toMatchObject({ inquiriesCount: 4, meetingsCount: 3, meetingRate: 100 });
    expect(previous.monthlyTrend.slice(-2)).toEqual([{ month: "2026-09", inquiries: 4, meetings: 3 }, { month: "2026-10", inquiries: 5, meetings: 5 }]);
    expect(aggregateLeads(rows, leadPeriod("six", now)).inquiriesCount).toBe(9);
  });
  it("handles zero counts, null dates, future cutoffs and year rollover", () => {
    expect(aggregateLeads([], leadPeriod("month", now))).toMatchObject({ meetingRate: null, meetingsCount: 0, inquiriesCount: 0 });
    expect(aggregateLeads([fact({ occurredAt: now })], leadPeriod("month", now)).inquiriesCount).toBe(0);
    expect(monthOffset("2026-01", -1)).toBe("2025-12");
    expect(jstDay(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
    expect(leadPeriod("six").period).toBe("six");
    expect(() => leadPeriod("bad", now)).toThrow("期間");
  });
  it("validates only structured choices and IDs", () => {
    expect(leadObject({ a: 1 })).toEqual({ a: 1 });
    for (const value of [null, 1, "", []]) expect(() => leadObject(value)).toThrow();
    expect(leadChoice("a", { a: "A" })).toBe("a");
    for (const value of [null, "toString", "b"]) expect(() => leadChoice(value, { a: "A" })).toThrow();
    expect(leadId("id_1-2")).toBe("id_1-2");
    for (const value of [null, "", "x".repeat(81), "../x"]) expect(() => leadId(value)).toThrow();
    expect(leadVersion(1)).toBe(1);
    for (const value of [0, -1, 1.5, "1", null]) expect(() => leadVersion(value)).toThrow();
  });
  it("accepts optional grade clearing and explicit edits, rejects malformed or future dates", () => {
    expect(parseLeadEdit({ channel: "other", grade: "high_school", status: "lost", occurredAt: "2026-10-02T10:00+09:00" }, now)).toEqual({ channel: "other", grade: "high_school", status: "lost", occurredAt: new Date("2026-10-02T01:00Z") });
    expect(parseLeadEdit({ grade: null }, now)).toEqual({ grade: null });
    expect(() => parseLeadEdit({}, now)).toThrow("変更");
    for (const occurredAt of [1, "not-date", "2026-99-01T00:00Z", "2027-01-01T00:00Z", "1999-01-01T00:00Z"]) expect(() => parseLeadEdit({ occurredAt }, now)).toThrow("日時");
  });
});
