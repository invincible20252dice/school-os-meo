import { expect, it, vi } from "vitest";
import Page from "./page";
const read = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/prisma", () => ({ prisma: {
  school: { findUnique: read }, targetKeyword: { findFirst: read }, instagramSetting: { findUnique: read },
} }));
vi.mock("@/lib/mock-instagram-sync", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/mock-instagram-sync")>();
  return { ...actual, buildMockInstagramSyncPreview: vi.fn(actual.buildMockInstagramSyncPreview) };
});
it("server rendering a forged school query never reads school data or generates a preview", async () => {
  const preview = await import("@/lib/mock-instagram-sync");
  await Page({ searchParams: Promise.resolve({ schoolId: "other-school" }) });
  expect(read).not.toHaveBeenCalled();
  expect(preview.buildMockInstagramSyncPreview).not.toHaveBeenCalled();
});
