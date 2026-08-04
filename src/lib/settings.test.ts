import { describe, expect, it } from "vitest";
import {
  buildMockSchoolSetting,
  buildEmptySchoolSetting,
  buildSettingsTabs,
  maskSecret,
  normalizeSchoolSetting,
  validateSchoolSetting,
} from "./settings";

describe("settings", () => {
  it("builds settings tabs for the owner settings page", () => {
    expect(buildSettingsTabs().map((tab) => tab.href)).toEqual([
      "/dashboard/settings",
      "/dashboard/settings/line",
      "/dashboard/settings/instagram",
      "/dashboard/settings/prompts",
    ]);
  });

  it("builds a mock school setting with Google, LINE, Instagram, and prompt settings", () => {
    const setting = buildMockSchoolSetting();

    expect(setting.googleConnected).toBe(true);
    expect(setting.lineNotifyEnabled).toBe(true);
    expect(setting.instagramConnected).toBe(false);
    expect(setting.instagramMetaAppId).toBeTruthy();
    expect(setting.promptReviewTone).toBe("FRIENDLY");
    expect(setting.promptForbiddenWords).toContain("絶対合格");
    expect(setting.promptMustKeywords).toContain("個別指導");
  });

  it("builds an empty school setting for DB-backed settings screens", () => {
    const setting = buildEmptySchoolSetting(" school-live-001 ");

    expect(setting.schoolId).toBe("school-live-001");
    expect(setting.googleConnected).toBe(false);
    expect(setting.googleRefreshToken).toBe("");
    expect(setting.lineNotifyEnabled).toBe(true);
    expect(setting.promptForbiddenWords).toEqual([]);
  });

  it("validates connected settings", () => {
    const setting = buildMockSchoolSetting();

    expect(validateSchoolSetting(setting)).toEqual([]);
    expect(
      validateSchoolSetting({
        ...setting,
        googleConnected: true,
        googleAccountId: "",
        selectedGbpLocationId: "",
        lineNotifyEnabled: true,
        lineChannelAccessToken: "",
        lineDestinationId: "",
        instagramConnected: true,
        instagramMetaAppId: "",
        instagramMetaAppSecret: "",
        promptReviewTone: "UNKNOWN",
      }),
    ).toEqual([
      "Google連携時はGoogleアカウントIDを入力してください。",
      "Google連携時はGBP店舗IDを選択してください。",
      "LINE通知有効時はチャネルアクセストークンを入力してください。",
      "LINE通知有効時は送信先IDを入力してください。",
      "Instagram連携時はMeta App IDを入力してください。",
      "Instagram連携時はMeta App Secretを入力してください。",
      "返信トーンは FRIENDLY / FORMAL / CASUAL のいずれかを選択してください。",
    ]);
  });

  it("normalizes nullable Instagram account settings from database rows", () => {
    const setting = normalizeSchoolSetting({
      id: "setting-live-001",
      schoolId: "school-live-001",
      instagramConnected: null,
      instagramMetaAppId: null,
      instagramMetaAppSecret: null,
      instagramBusinessAccountId: "17841400000000000",
      instagramAccountName: null,
      instagramAccessToken: null,
      promptForbiddenWords: null,
      promptMustKeywords: null,
    });

    expect(setting.id).toBe("setting-live-001");
    expect(setting.schoolId).toBe("school-live-001");
    expect(setting.instagramConnected).toBe(true);
    expect(setting.instagramMetaAppId).toBe("");
    expect(setting.instagramMetaAppSecret).toBe("");
    expect(setting.instagramBusinessAccountId).toBe("17841400000000000");
    expect(setting.instagramAccountName).toBe("");
    expect(setting.instagramAccessToken).toBe("");
    expect(setting.promptForbiddenWords).toEqual([]);
    expect(setting.promptMustKeywords).toEqual([]);
  });

  it("keeps explicit disabled flags without injecting demo settings during normalization", () => {
    const setting = normalizeSchoolSetting({
      id: "",
      schoolId: "",
      googleConnected: false,
      lineNotifyEnabled: false,
      notifyOnNewReview: false,
      notifyOnLowRating: false,
      instagramConnected: false,
      instagramBusinessAccountId: "",
      instagramAccountName: "",
      instagramAccessToken: "token-present",
      promptReviewTone: null,
      promptForbiddenWords: ["", "誇大表現"],
      promptMustKeywords: ["地域密着", ""],
      updatedAt: "",
    });

    expect(setting.id).toBe("");
    expect(setting.schoolId).toBe("");
    expect(setting.googleConnected).toBe(false);
    expect(setting.lineNotifyEnabled).toBe(false);
    expect(setting.notifyOnNewReview).toBe(false);
    expect(setting.notifyOnLowRating).toBe(false);
    expect(setting.instagramConnected).toBe(false);
    expect(setting.promptReviewTone).toBe("FRIENDLY");
    expect(setting.promptForbiddenWords).toEqual(["誇大表現"]);
    expect(setting.promptMustKeywords).toEqual(["地域密着"]);
    expect(setting.updatedAt).toBe("");
  });

  it("does not inject mock Google account values into empty settings", () => {
    const setting = normalizeSchoolSetting();

    expect(setting.googleConnected).toBe(false);
    expect(setting.googleAccountId).toBe("");
    expect(setting.googleRefreshToken).toBe("");
    expect(setting.selectedGbpLocationId).toBe("");
  });

  it("masks saved secrets for display", () => {
    expect(maskSecret("")).toBe("未保存");
    expect(maskSecret("short")).toBe("********");
    expect(maskSecret("EAABwzLongTokenValue")).toBe("EAAB••••alue");
  });
});
