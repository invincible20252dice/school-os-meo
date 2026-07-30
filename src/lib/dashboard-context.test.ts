import { describe, expect, it } from "vitest";
import {
  buildDashboardContext,
  canSwitchDashboardSchool,
  resolveDashboardCurrentSchool,
} from "./dashboard-context";
import type { ResolvedUserAccess } from "./access-control";

const adminAccess: ResolvedUserAccess = {
  userId: "admin-1",
  role: "admin",
  schoolId: "",
  schoolIds: [],
  name: "本部",
  email: "admin@example.com",
  status: "active",
  source: "profiles",
};

const schools = [
  { id: "school-1", name: "iスクール予備校" },
  { id: "school-2", name: "iスクール駅前校" },
];

describe("dashboard-context", () => {
  it("allows admin users to switch active school", () => {
    expect(canSwitchDashboardSchool(adminAccess)).toBe(true);
    expect(
      buildDashboardContext({
        access: adminAccess,
        schools,
        requestedSchoolId: "school-2",
      }),
    ).toMatchObject({
      currentSchoolId: "school-2",
      currentSchoolName: "iスクール駅前校",
      canSwitchSchool: true,
    });
  });

  it("resolves manager current school from assigned profile", () => {
    const managerAccess: ResolvedUserAccess = {
      ...adminAccess,
      role: "manager",
      schoolId: "school-1",
      schoolIds: ["school-1"],
      status: "active",
    };

    expect(canSwitchDashboardSchool(managerAccess)).toBe(false);
    expect(resolveDashboardCurrentSchool(managerAccess, schools, "missing")).toEqual(
      schools[0],
    );
  });

  it("handles users without accessible schools", () => {
    const context = buildDashboardContext({
      access: { ...adminAccess, status: "pending" },
      schools: [],
    });

    expect(context.currentSchoolId).toBe("");
    expect(context.currentSchoolName).toBe("校舎未設定");
    expect(context.canSwitchSchool).toBe(false);
  });
});
