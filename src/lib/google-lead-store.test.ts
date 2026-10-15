import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { changeGoogleLead, createGoogleLead, loadGoogleLeadOperation, loadGoogleLeads } from "./google-lead-store";
import { createLeadOperationKey } from "./google-lead-operation-key";
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
  expect(prisma.googleLead.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { schoolId: "a", source: "google", deletedAt: null, OR: [{ occurredAt: { gte: new Date("2026-04-30T15:00Z"), lt: now } }, { meetingAt: { gte: new Date("2026-04-30T15:00Z"), lt: now } }, ...["meetingScheduledAt", "meetingHeldAt", "enrolledAt"].map(field => ({ [field]: { gte: new Date("2026-04-30T15:00Z"), lt: now } }))] } }));
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
const recoveryOwner = "11111111-2222-4333-8444-555555555555";
const recoveryKey = createLeadOperationKey(recoveryOwner, "line", "99999999-8888-4777-8666-555555555555");
it("validates reserved POST ownership/channel before any write and redacts the key", async () => {
  await expect(createGoogleLead("a", { channel: "line", idempotencyKey: recoveryKey })).rejects.toMatchObject({ status: 403 });
  await expect(createGoogleLead("a", { channel: "phone", idempotencyKey: recoveryKey }, now, recoveryOwner)).rejects.toMatchObject({ status: 400 });
  await expect(createGoogleLead("a", { channel: "line", idempotencyKey: "gr1_bad" }, now, recoveryOwner)).rejects.toMatchObject({ status: 400 });
  expect(prisma.googleLead.upsert).not.toHaveBeenCalled();
  vi.mocked(prisma.googleLead.upsert).mockResolvedValue({ ...row, idempotencyKey: recoveryKey } as never);
  expect(await createGoogleLead("a", { channel: "line", idempotencyKey: recoveryKey }, now, recoveryOwner)).toEqual(row);
});
it.each([
  [null, "absent"],
  [row, "saved"],
  [{ ...row, channel: "phone" }, "changed"],
  [{ ...row, version: 2 }, "changed"],
  [{ ...row, version: 2, deletedAt: now }, "deleted"],
] as const)("returns only recovery state %s -> %s from exact scoped read", async (stored, expected) => {
  vi.mocked(prisma.googleLead.findFirst).mockResolvedValue(stored as never);
  expect(await loadGoogleLeadOperation("a", recoveryKey, recoveryOwner)).toBe(expected);
  expect(prisma.googleLead.findFirst).toHaveBeenCalledWith({ where: { schoolId: "a", idempotencyKey: recoveryKey, source: "google" }, select: { channel: true, version: true, deletedAt: true } });
  expect(prisma.googleLead.upsert).not.toHaveBeenCalled();
  expect(prisma.googleLead.updateMany).not.toHaveBeenCalled();
});
it("never queries operation state for legacy, malformed, or foreign-owner keys", async () => {
  for (const key of ["legacy-key", "gr1_bad", recoveryKey]) await expect(loadGoogleLeadOperation("a", key, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).rejects.toThrow();
  expect(prisma.googleLead.findFirst).not.toHaveBeenCalled();
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
