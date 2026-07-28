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
  const profileQuery = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: profile,
          error: null,
        })),
      })),
    })),
  };
  const invitationQuery = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: null,
          error: null,
        })),
      })),
    })),
  };

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
    from: vi.fn((table: string) =>
      table === "profile_invitations" ? invitationQuery : profileQuery,
    ),
  };
}

function buildInvitationClient() {
  const profileSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: null,
      })),
    })),
  }));
  const profileUpsert = vi.fn(() => ({
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: {
          role: "manager",
          school_id: "school-invited",
          school_ids: ["school-invited"],
          full_name: "招待ユーザー",
          status: "active",
        },
        error: null,
      })),
    })),
  }));
  const invitationUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ data: {}, error: null })),
  }));
  const invitationSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: {
          email: "manager@example.com",
          role: "manager",
          school_id: "school-invited",
          status: "pending",
        },
        error: null,
      })),
    })),
  }));

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "Manager@Example.com",
            user_metadata: { name: "招待ユーザー" },
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) =>
      table === "profile_invitations"
        ? { select: invitationSelect, update: invitationUpdate }
        : { select: profileSelect, upsert: profileUpsert },
    ),
    profileUpsert,
    invitationUpdate,
  };
}

function buildInvitationVariantClient(invitation: unknown, invitationError = null) {
  const profileSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: null,
      })),
    })),
  }));
  const invitationSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: invitation,
        error: invitationError,
      })),
    })),
  }));

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
    from: vi.fn((table: string) =>
      table === "profile_invitations"
        ? {
            select: invitationSelect,
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: {}, error: null })),
            })),
          }
        : {
            select: profileSelect,
            upsert: vi.fn(),
          },
    ),
  };
}

function buildUserWithoutEmailClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
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
    expect(client.from).toHaveBeenCalledTimes(1);
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

  it("applies a pre-registered invitation on first Google login", async () => {
    const client = buildInvitationClient();
    const request = new Request("http://localhost/api", {
      headers: { authorization: "Bearer jwt-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.access).toEqual(
      expect.objectContaining({
        role: "manager",
        schoolId: "school-invited",
        status: "active",
        source: "profiles",
      }),
    );
    expect(client.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        role: "manager",
        school_id: "school-invited",
        school_ids: ["school-invited"],
        status: "active",
      }),
      { onConflict: "id" },
    );
    expect(client.invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        accepted_user_id: "user-1",
      }),
    );
  });

  it("keeps revoked invitations pending instead of applying access", async () => {
    const client = buildInvitationVariantClient({
      email: "manager@example.com",
      role: "manager",
      school_id: "school-1",
      status: "revoked",
    });
    const request = new Request("http://localhost/api", {
      headers: { authorization: "Bearer jwt-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.access.status).toBe("pending");
    expect(result.access.schoolId).toBe("");
  });

  it("skips invitation lookup when the auth user has no email", async () => {
    const client = buildUserWithoutEmailClient();
    const request = new Request("http://localhost/api", {
      headers: { authorization: "Bearer jwt-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.access.status).toBe("pending");
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("does not approve manager invitations without a school", async () => {
    const client = buildInvitationVariantClient({
      email: "manager@example.com",
      role: "manager",
      school_id: "",
      status: "pending",
    });
    const request = new Request("http://localhost/api", {
      headers: { authorization: "Bearer jwt-token" },
    });

    const result = await resolveRequestAccess(
      request,
      new URL(request.url),
      client as never,
    );

    expect(result.access.status).toBe("pending");
  });

  it("surfaces invitation lookup errors", async () => {
    const client = buildInvitationVariantClient(null, {
      message: "invitation lookup failed",
    });

    await expect(
      resolveRequestAccess(
        new Request("http://localhost/api", {
          headers: { authorization: "Bearer jwt-token" },
        }),
        new URL("http://localhost/api"),
        client as never,
      ),
    ).rejects.toThrow("invitation lookup failed");
  });

  it("surfaces profile creation errors while accepting invitations", async () => {
    const client = buildInvitationClient();
    client.profileUpsert.mockReturnValueOnce({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: null,
          error: { message: "profile upsert failed" },
        })),
      })),
    });

    await expect(
      resolveRequestAccess(
        new Request("http://localhost/api", {
          headers: { authorization: "Bearer jwt-token" },
        }),
        new URL("http://localhost/api"),
        client as never,
      ),
    ).rejects.toThrow("profile upsert failed");
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
