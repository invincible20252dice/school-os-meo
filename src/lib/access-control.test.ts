import { describe, expect, it } from "vitest";
import {
  normalizeAccessRole,
  resolveScopedSchoolAccess,
  resolveUserAccessFromSupabase,
} from "./access-control";

describe("access-control", () => {
  it("normalizes admin and manager roles", () => {
    expect(normalizeAccessRole("admin")).toBe("admin");
    expect(normalizeAccessRole("HEADQUARTERS")).toBe("admin");
    expect(normalizeAccessRole("owner")).toBe("admin");
    expect(normalizeAccessRole("manager")).toBe("manager");
    expect(normalizeAccessRole("staff")).toBe("manager");
    expect(normalizeAccessRole("unknown")).toBe("manager");
  });

  it("resolves profile access before user metadata", () => {
    const access = resolveUserAccessFromSupabase(
      {
        id: "user-1",
        email: "owner@example.com",
        user_metadata: {
          role: "admin",
          school_id: "school-from-metadata",
          full_name: "Metadata User",
        },
      },
      {
        role: "manager",
        school_id: "school-from-profile",
        full_name: "Profile User",
      },
    );

    expect(access).toEqual(
      expect.objectContaining({
        userId: "user-1",
        role: "manager",
        schoolId: "school-from-profile",
        schoolIds: ["school-from-profile"],
        name: "Profile User",
        source: "profiles",
      }),
    );
  });

  it("resolves access from metadata when a profile row is absent", () => {
    const access = resolveUserAccessFromSupabase({
      id: "user-2",
      email: "metadata@example.com",
      user_metadata: {
        role: "admin",
        school_ids: ["school-a", "", "school-b"],
        name: "Metadata Name",
      },
    });

    expect(access).toEqual(
      expect.objectContaining({
        role: "admin",
        schoolId: "school-a",
        schoolIds: ["school-a", "school-b"],
        name: "Metadata Name",
        source: "user_metadata",
      }),
    );
  });

  it("falls back to email and default user data when profile and metadata are absent", () => {
    expect(
      resolveUserAccessFromSupabase({
        id: "user-3",
        email: "fallback@example.com",
      }),
    ).toEqual(
      expect.objectContaining({
        role: "manager",
        schoolId: "",
        schoolIds: [],
        name: "fallback@example.com",
        source: "fallback",
      }),
    );

    expect(resolveUserAccessFromSupabase({ id: "user-4" }).name).toBe(
      "ユーザー",
    );
  });

  it("allows admin users to request all schools", () => {
    expect(
      resolveScopedSchoolAccess(
        { userId: "admin", role: "admin", schoolIds: [] },
        "all",
      ),
    ).toEqual({
      requestedSchoolId: "all",
      effectiveSchoolId: undefined,
      role: "admin",
      canSwitchSchool: true,
    });
  });

  it("forces manager users to their assigned school", () => {
    expect(
      resolveScopedSchoolAccess(
        {
          userId: "manager",
          role: "manager",
          schoolId: "school-own",
          schoolIds: ["school-own"],
        },
        "school-other",
      ),
    ).toEqual({
      requestedSchoolId: "school-other",
      effectiveSchoolId: "school-own",
      role: "manager",
      canSwitchSchool: false,
    });
  });
});
