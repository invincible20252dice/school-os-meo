import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { syncInstagramPosts } from "./instagram-sync";

const setting = (schoolId = "a") => ({ id: `setting-${schoolId}`, schoolId,
  instagramAccessToken: "synthetic-token", instagramBusinessAccountId: "synthetic-account",
  autoSyncEnabled: true, school: { id: schoolId, name: "Synthetic", gbpLocationId: "locations/synthetic" } });
const db = () => ({ $queryRaw: vi.fn().mockResolvedValue([{ ready: true }]),
  instagramSetting: { findMany: vi.fn().mockResolvedValue([setting()]), update: vi.fn() },
  syncedPost: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() } });
beforeEach(() => { vi.stubEnv("GBP_LOCAL_POSTS_API_URL", "https://gbp.example.invalid/posts"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function noEffects(prisma: ReturnType<typeof db>, fetchImpl: ReturnType<typeof vi.fn>) {
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(prisma.syncedPost.findUnique).not.toHaveBeenCalled();
  expect(prisma.syncedPost.create).not.toHaveBeenCalled();
  expect(prisma.instagramSetting.update).not.toHaveBeenCalled();
}
it.each([{ result: [{ ready: false }] }, { result: [] }, { result: [{ ready: "true" }] }])("rejects unavailable/unknown schema metadata %j before business reads", async ({ result }) => {
  const prisma = db(), fetchImpl = vi.fn(async () => Response.json({ data: [] }));
  prisma.$queryRaw.mockResolvedValue(result);
  await expect(syncInstagramPosts({ prisma, fetchImpl })).rejects.toThrow("同期利用不可");
  expect(prisma.instagramSetting.findMany).not.toHaveBeenCalled(); noEffects(prisma, fetchImpl);
});
it("sanitizes metadata read failures and fails closed", async () => {
  const prisma = db(), fetchImpl = vi.fn(async () => Response.json({ data: [] }));
  prisma.$queryRaw.mockRejectedValue(new Error("private database detail"));
  await expect(syncInstagramPosts({ prisma, fetchImpl })).rejects.toThrow("同期利用不可");
  noEffects(prisma, fetchImpl);
});
it.each(["", "   ", "invalid", "http://gbp.example.invalid/posts", "https://user:secret@gbp.example.invalid/posts"])("rejects unsafe/missing endpoint %j before Instagram or AI", async endpoint => {
  vi.stubEnv("GBP_LOCAL_POSTS_API_URL", endpoint); vi.stubEnv("OPENAI_API_KEY", "synthetic");
  const prisma = db(), fetchImpl = vi.fn(async () => Response.json({ data: [] }));
  await expect(syncInstagramPosts({ prisma, fetchImpl })).rejects.toThrow("同期利用不可");
  noEffects(prisma, fetchImpl);
});
it.each(["instagramAccessToken", "instagramBusinessAccountId", "gbpLocationId", "schoolId", "name"])("validates the second school's %s before starting the first school", async field => {
  const prisma = db(), fetchImpl = vi.fn(async () => Response.json({ data: [] }));
  const invalid = setting("b");
  if (field === "gbpLocationId" || field === "name") invalid.school[field] = " ";
  else invalid[field as "instagramAccessToken" | "instagramBusinessAccountId" | "schoolId"] = " ";
  prisma.instagramSetting.findMany.mockResolvedValue([setting(), invalid]);
  await expect(syncInstagramPosts({ prisma, fetchImpl })).rejects.toThrow("同期利用不可");
  noEffects(prisma, fetchImpl);
});
it("rejects mismatched school relation or an unexpected returned school", async () => {
  const prisma = db(), fetchImpl = vi.fn(async () => Response.json({ data: [] }));
  const invalid = setting(); invalid.school.id = "b";
  prisma.instagramSetting.findMany.mockResolvedValue([invalid]);
  await expect(syncInstagramPosts({ prisma, fetchImpl, schoolId: "a" })).rejects.toThrow("同期利用不可");
  noEffects(prisma, fetchImpl);
  prisma.instagramSetting.findMany.mockResolvedValue([setting("b")]);
  await expect(syncInstagramPosts({ prisma, fetchImpl, schoolId: "a" })).rejects.toThrow("同期利用不可");
  noEffects(prisma, fetchImpl);
});
it("keeps a configured-schema empty selection as a no-effect no-op", async () => {
  const prisma = db(), fetchImpl = vi.fn();
  prisma.instagramSetting.findMany.mockResolvedValue([]);
  vi.stubEnv("GBP_LOCAL_POSTS_API_URL", "");
  expect(await syncInstagramPosts({ prisma, fetchImpl })).toEqual({ settings: 0, fetched: 0, posted: 0, skipped: 0 });
  noEffects(prisma, fetchImpl);
});
