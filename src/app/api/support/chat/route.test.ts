import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/access-control", () => ({ isApprovedAccess: vi.fn() }));
beforeEach(() => {
  vi.mocked(resolveRequestAccess).mockResolvedValue({ isAuthenticated: true, access: {} } as never);
  vi.mocked(isApprovedAccess).mockReturnValue(true);
});
const request = (body: unknown) => new Request("https://example.com/api/support/chat", { method: "POST", body: JSON.stringify(body) });
describe("support FAQ API", () => {
  it.each([["口コミ返信", "実際の投稿"], ["QRコード", "回答用URL"], ["Googleの順位", "シミュレーション"], ["ＡＩ分析", "感情"], ["不明な操作", "このFAQでは"]])("answers %s without school data or LLM calls", async (message, expected) => {
    const response = await POST(request({ message }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ success: true, mode: "FAQ", reply: expect.stringContaining(expected) });
  });
  it.each([null, {}, { message: 123 }, { message: " " }, { message: "a".repeat(1001) }])("rejects invalid input %s", async body => { expect((await POST(request(body))).status).toBe(400); });
  it("rejects invalid JSON", async () => { expect((await POST(new Request("https://example.com", { method: "POST", body: "{" }))).status).toBe(400); });
  it("requires login", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValue({ isAuthenticated: false } as never);
    expect((await POST(request({ message: "返信" }))).status).toBe(401);
  });
  it("requires approval", async () => {
    vi.mocked(isApprovedAccess).mockReturnValue(false);
    expect((await POST(request({ message: "返信" }))).status).toBe(403);
  });
  it("does not turn auth outages into successful answers", async () => {
    vi.mocked(resolveRequestAccess).mockRejectedValue(new Error("secret"));
    const response = await POST(request({ message: "返信" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});
