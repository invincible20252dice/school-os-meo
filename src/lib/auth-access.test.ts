import { describe, expect, it } from "vitest";
import {
  buildLoginProviders,
  buildMagicLinkMessage,
  buildDemoDashboardAccessContext,
  canAccessSchool,
  canSwitchSchool,
  getDashboardSettingsPath,
  getAccessibleSchoolIds,
  getDemoGoogleLoginPath,
  getDemoLogoutPath,
  getPostLoginPath,
  isFixedSchoolRole,
  resolveEffectiveSchoolIdForRequest,
} from "./auth-access";

describe("auth access", () => {
  it("builds the Google-only login provider", () => {
    expect(buildLoginProviders()).toEqual([
      expect.objectContaining({ id: "google", label: "Googleでログイン" }),
    ]);
  });

  it("allows headquarters users to access every school", () => {
    expect(
      canAccessSchool(
        { userId: "user-headquarters", role: "HEADQUARTERS", schoolIds: [] },
        "school-a",
      ),
    ).toBe(true);
  });

  it("limits owner users to assigned schools", () => {
    const owner = { userId: "user-owner", role: "OWNER" as const, schoolIds: ["school-a"] };

    expect(canAccessSchool(owner, "school-a")).toBe(true);
    expect(canAccessSchool(owner, "school-b")).toBe(false);
  });

  it("returns accessible school IDs based on role", () => {
    const schools = ["school-a", "school-b", "school-c"];

    expect(
      getAccessibleSchoolIds(
        { userId: "user-headquarters", role: "HEADQUARTERS", schoolIds: [] },
        schools,
      ),
    ).toEqual(schools);
    expect(
      getAccessibleSchoolIds(
        { userId: "user-owner", role: "OWNER", schoolIds: ["school-b"] },
        schools,
      ),
    ).toEqual(["school-b"]);
  });

  it("routes users after login by role", () => {
    expect(getPostLoginPath({ userId: "hq", role: "HEADQUARTERS", schoolIds: [] })).toBe(
      "/dashboard",
    );
    expect(getPostLoginPath({ userId: "admin", role: "admin", schoolIds: [] })).toBe(
      "/dashboard",
    );
    expect(getPostLoginPath({ userId: "owner", role: "OWNER", schoolIds: ["school-a"] })).toBe(
      "/dashboard/settings",
    );
  });

  it("allows admin and lowercase owner users to switch school selection", () => {
    expect(canSwitchSchool({ userId: "admin", role: "admin", schoolIds: [] })).toBe(
      true,
    );
    expect(canSwitchSchool({ userId: "owner", role: "owner", schoolIds: [] })).toBe(
      true,
    );
  });

  it("fixes staff and manager users to their own school", () => {
    const staff = {
      userId: "staff",
      role: "staff" as const,
      schoolId: "school-own",
      schoolIds: ["school-own"],
    };

    expect(canSwitchSchool(staff)).toBe(false);
    expect(resolveEffectiveSchoolIdForRequest(staff, "school-other")).toBe(
      "school-own",
    );
    expect(
      resolveEffectiveSchoolIdForRequest(
        { ...staff, role: "manager" },
        "school-other",
      ),
    ).toBe("school-own");
    expect(isFixedSchoolRole("staff")).toBe(true);
    expect(isFixedSchoolRole("manager")).toBe(true);
    expect(isFixedSchoolRole("OWNER")).toBe(true);
    expect(isFixedSchoolRole("admin")).toBe(false);
  });

  it("keeps all-school summary available only for switchable users", () => {
    expect(
      resolveEffectiveSchoolIdForRequest(
        { userId: "admin", role: "admin", schoolIds: [] },
        "all",
      ),
    ).toBeUndefined();
    expect(
      resolveEffectiveSchoolIdForRequest(
        {
          userId: "staff",
          role: "staff",
          schoolId: "school-fixed",
          schoolIds: ["school-fixed"],
        },
        "all",
      ),
    ).toBe("school-fixed");
  });

  it("builds dashboard access context for switchable and fixed-school users", () => {
    expect(buildDemoDashboardAccessContext().canSwitchSchool).toBe(true);

    const staffContext = buildDemoDashboardAccessContext({
      role: "staff",
      schoolId: "school-demo-002",
      schoolIds: ["school-demo-002"],
    });

    expect(staffContext.canSwitchSchool).toBe(false);
    expect(staffContext.currentSchoolId).toBe("school-demo-002");
    expect(staffContext.currentSchoolName).toBe("青葉ゼミナール 駅前校");
  });

  it("provides demo login behavior helpers", () => {
    expect(getDemoGoogleLoginPath()).toBe("/dashboard");
    expect(getDashboardSettingsPath()).toBe("/dashboard/settings");
    expect(getDemoLogoutPath()).toBe("/login");
    expect(buildMagicLinkMessage(" owner@example.com ")).toBe(
      "owner@example.com 宛に認証リンクを送信しました。",
    );
    expect(buildMagicLinkMessage(" ")).toBe("メールアドレスを入力してください。");
  });
});
