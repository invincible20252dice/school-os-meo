import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-access", () => ({
  resolveRequestAccess: vi.fn(async () => ({
    isAuthenticated: true,
    access: {
      userId: "user-1",
      role: "manager",
      schoolId: "",
      schoolIds: [],
      name: "承認待ち",
      email: "pending@example.com",
      status: "pending",
      source: "profiles",
    },
  })),
}));

describe("GET /api/auth/me", () => {
  it("returns pending approval state", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.approved).toBe(false);
    expect(body.access.status).toBe("pending");
  });

  it("returns unauthorized when access resolution fails", async () => {
    const access = await import("@/lib/supabase-access");
    vi.mocked(access.resolveRequestAccess).mockRejectedValueOnce(
      new Error("Invalid JWT"),
    );
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/me"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.approved).toBe(false);
  });
});
