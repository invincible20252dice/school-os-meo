import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildScopedSchoolFilter,
  resolveRequestAccess,
} from "./supabase-access";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

function buildClient(profile: unknown, userMetadata: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "manager@example.com",
            user_metadata: userMetadata,
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: profile,
            error: null,
          })),
        })),
      })),
    })),
  };
}

function buildProfileErrorClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "manager@example.com",
            user_metadata: {},
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: null,
            error: { message: "profiles fetch failed" },
          })),
        })),
      })),
    })),
  };
}

describe("supabase-access", () => {
  it("falls back to existing headers when bearer auth is absent", async () => {
    const request = new Request(
      "http://localhost/api?ownerId=user-fallback&userSchoolId=school-1",
      {
        headers: { "x-user-role": "manager" },
      },
    );
    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      buildClient(null) as never,
    );

    expect(result.isAuthenticated).toBe(false);
    expect(result.access).toEqual(
      expect.objectContaining({
        userId: "user-fallback",
        role: "manager",
        schoolId: "school-1",
      }),
    );
  });

  it("resolves access from Supabase profiles for bearer requests", async () => {
    const client = buildClient({
      role: "manager",
      school_id: "school-profile",
      full_name: "教室長",
      status: "active",
    });
    const request = new Request("http://localhost/api", {
      headers: { authorization: "Bearer jwt-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.isAuthenticated).toBe(true);
    expect(client.auth.getUser).toHaveBeenCalledWith("jwt-token");
    expect(result.access).toEqual(
      expect.objectContaining({
        role: "manager",
        schoolId: "school-profile",
        schoolIds: ["school-profile"],
        name: "教室長",
        status: "active",
      }),
    );
  });

  it("accepts explicit Supabase access token headers", async () => {
    const client = buildClient({
      role: "admin",
      school_ids: ["school-a"],
      status: "active",
    });
    const request = new Request("http://localhost/api", {
      headers: { "x-supabase-access-token": "explicit-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.isAuthenticated).toBe(true);
    expect(client.auth.getUser).toHaveBeenCalledWith("explicit-token");
    expect(result.access.role).toBe("admin");
  });

  it("does not treat analytics API secrets as Supabase user tokens", async () => {
    process.env.ANALYTICS_API_SECRET = "analytics-secret";
    const request = new Request("http://localhost/api?ownerId=user-service", {
      headers: { authorization: "Bearer analytics-secret" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      buildClient(null) as never,
    );

    expect(result.isAuthenticated).toBe(false);
    expect(result.access.userId).toBe("user-service");
  });

  it("builds the school filter from resolved access", () => {
    expect(
      buildScopedSchoolFilter(
        {
          userId: "manager",
          role: "manager",
          schoolId: "school-own",
          schoolIds: ["school-own"],
          name: "教室長",
          email: "manager@example.com",
          status: "active",
          source: "profiles",
        },
        "school-other",
      ).effectiveSchoolId,
    ).toBe("school-own");
  });

  it("rejects invalid bearer tokens", async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "Invalid JWT" },
        })),
      },
      from: vi.fn(),
    };

    await expect(
      resolveRequestAccess(
        new Request("http://localhost/api", {
          headers: { authorization: "Bearer bad" },
        }),
        new URL("http://localhost/api"),
        client as never,
      ),
    ).rejects.toThrow("Invalid JWT");
  });

  it("surfaces profile lookup errors", async () => {
    await expect(
      resolveRequestAccess(
        new Request("http://localhost/api", {
          headers: { authorization: "Bearer valid-token" },
        }),
        new URL("http://localhost/api"),
        buildProfileErrorClient() as never,
      ),
    ).rejects.toThrow("profiles fetch failed");
  });
});
