import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { changeGoogleLead, createGoogleLead, loadGoogleLeads } from "./google-lead-store";
vi.mock("./prisma", () => ({ prisma: { googleLead: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } } }));
const now = new Date("2026-10-03T12:00:00Z");
const row = { id: "r", schoolId: "a", channel: "line", grade: null, status: "inquiry", version: 1, occurredAt: new Date("2026-10-01T00:00Z"), meetingAt: null, closedAt: null, deletedAt: null };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue(row as never);
  vi.mocked(prisma.googleLead.upsert).mockResolvedValue(row as never);
  vi.mocked(prisma.googleLead.updateMany).mockResolvedValue({ count: 1 });
  vi.mocked(prisma.googleLead.findMany).mockResolvedValue([]);
});
it("scopes the two list queries and includes old inquiries converted this month", async () => {
  await loadGoogleLeads("a", "month", now);
  expect(prisma.googleLead.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { schoolId: "a", source: "google", deletedAt: null, OR: [{ occurredAt: { gte: new Date("2026-04-30T15:00Z"), lt: now } }, { meetingAt: { gte: new Date("2026-04-30T15:00Z"), lt: now } }] } }));
  expect(prisma.googleLead.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 20, where: { schoolId: "a", source: "google", deletedAt: null, occurredAt: { gte: new Date("2026-09-30T15:00Z"), lt: now } } }));
  expect((await loadGoogleLeads("a", "month")).inquiriesCount).toBe(0);
});
it.each(["line", "phone", "web"])("creates %s with a school-scoped idempotency key, never client status/date/source", async channel => {
  vi.mocked(prisma.googleLead.upsert).mockResolvedValue({ ...row, channel } as never);
  await createGoogleLead("a", { channel, idempotencyKey: "req1", schoolId: "b", source: "fake", status: "meeting" }, now);
  expect(prisma.googleLead.upsert).toHaveBeenCalledWith({ where: { schoolId_idempotencyKey: { schoolId: "a", idempotencyKey: "req1" } }, update: {}, create: { schoolId: "a", channel, idempotencyKey: "req1", occurredAt: now } });
});
it("rejects key reuse for a changed/deleted record and preserves valid replays", async () => {
  expect(await createGoogleLead("a", { channel: "line", idempotencyKey: "x" })).toEqual(row);
  await expect(createGoogleLead("a", { channel: "web", idempotencyKey: "x" })).rejects.toMatchObject({ status: 409 });
  vi.mocked(prisma.googleLead.upsert).mockResolvedValue({ ...row, deletedAt: now } as never);
  await expect(createGoogleLead("a", { channel: "line", idempotencyKey: "x" })).rejects.toMatchObject({ status: 409 });
});
it("updates meeting once, preserves its date during edits, and supports reverting", async () => {
  await changeGoogleLead("a", { id: "r", version: 1, status: "meeting" }, false, now);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith({ where: { schoolId: "a", id: "r", version: 1, deletedAt: null }, data: { status: "meeting", meetingAt: now, closedAt: null, version: { increment: 1 } } });
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue({ ...row, status: "meeting", meetingAt: now } as never);
  await changeGoogleLead("a", { id: "r", version: 1, grade: "elementary" }, false);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ grade: "elementary", meetingAt: now }) }));
  await changeGoogleLead("a", { id: "r", version: 1, status: "inquiry" }, false, now);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ meetingAt: null, closedAt: null }) }));
  await expect(changeGoogleLead("a", { id: "r", version: 1, occurredAt: "2026-10-03T12:00:01Z" }, false, new Date("2026-10-04"))).rejects.toThrow("面談");
});
it("keeps lost in the database and soft deletes without replacing other fields", async () => {
  await changeGoogleLead("a", { id: "r", version: 1, status: "lost" }, false, now);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "lost", closedAt: now }) }));
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue({ ...row, status: "lost", closedAt: now } as never);
  await changeGoogleLead("a", { id: "r", version: 1, channel: "other" }, false, now);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ closedAt: now }) }));
  await changeGoogleLead("a", { id: "r", version: 1 }, true, now);
  expect(prisma.googleLead.updateMany).toHaveBeenLastCalledWith({ where: { schoolId: "a", id: "r", version: 1, deletedAt: null }, data: { deletedAt: now, version: { increment: 1 } } });
});
it("enforces school ownership, optimistic versioning and update races", async () => {
  await expect(changeGoogleLead("a", { id: "r", version: 2, status: "meeting" }, false)).rejects.toMatchObject({ status: 409 });
  expect(prisma.googleLead.updateMany).not.toHaveBeenCalled();
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue(null);
  await expect(changeGoogleLead("b", { id: "r", version: 1 }, true)).rejects.toMatchObject({ status: 404 });
  expect(prisma.googleLead.findFirst).toHaveBeenLastCalledWith({ where: { schoolId: "b", id: "r", deletedAt: null } });
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue(row as never);
  vi.mocked(prisma.googleLead.updateMany).mockResolvedValue({ count: 0 });
  await expect(changeGoogleLead("a", { id: "r", version: 1 }, true)).rejects.toMatchObject({ status: 409 });
});
