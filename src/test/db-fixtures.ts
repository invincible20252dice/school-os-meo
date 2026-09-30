import type { GoogleAccount, InstagramSetting, Review, School, SchoolSetting, Survey } from "@prisma/client";

const timestamp = new Date("2026-08-01T00:00:00Z");

// Complete database rows keep test data checked against the generated Prisma schema.
const school: School = {
  id: "school-1", ownerId: "owner-1", name: "テスト校舎", googlePlaceId: "place-1", status: "ACTIVE",
  brandName: null, postalCode: null, prefecture: null, city: null, addressLine: null,
  phoneNumber: null, websiteUrl: null, googleMapsUrl: null, gbpAccountId: null, gbpLocationId: null,
  instagramUserId: null, lineChannelId: null, aiSearchPrompt: null, createdAt: timestamp, updatedAt: timestamp,
};
const schoolSetting: SchoolSetting = {
  id: "setting-1", schoolId: "school-1", googleConnected: false, googleAccountId: null,
  googleRefreshToken: null, selectedGbpLocationId: null, googleReviewUrl: null,
  lineNotifyEnabled: false, lineChannelAccessToken: null, lineDestinationId: null,
  notifyOnNewReview: true, notifyOnLowRating: true, instagramConnected: false,
  instagramMetaAppId: null, instagramMetaAppSecret: null, promptSystemRole: null,
  promptReviewTone: "FRIENDLY", promptForbiddenWords: [], promptMustKeywords: [],
  promptTargetLength: "150-250文字", promptAutoReplyApproval: false, createdAt: timestamp, updatedAt: timestamp,
};
const instagramSetting: InstagramSetting = {
  id: "instagram-1", schoolId: "school-1", metaAppId: null, metaAppSecret: null,
  instagramAccessToken: "", instagramBusinessAccountId: "", autoSyncEnabled: false,
  lastSyncedAt: null, createdAt: timestamp, updatedAt: timestamp,
};
const googleAccount: GoogleAccount = {
  id: "google-1", schoolId: "school-1", email: null, locationId: null, reviewUrl: null,
  refreshToken: null, status: "DISCONNECTED", updatedAt: timestamp,
};
const survey: Survey = {
  id: "survey-1", schoolId: "school-1", title: "テストアンケート", requiredKeywords: null,
  minCharCount: 100, maxCharCount: 300, isValid: true, benefitType: null, benefitShowTiming: null,
  createdAt: timestamp, updatedAt: timestamp,
};
const review: Review = {
  id: "review-1", schoolId: "school-1", authorId: null, source: "GOOGLE", status: "PENDING",
  parentName: null, studentGrade: null, rating: null, surveyAnswers: null, originalText: null,
  comment: null, generatedPatterns: null, selectedReviewText: null, googleReviewId: null,
  gbpReviewId: null, authorName: null, aiReplyText: null, aiReplyDraft: null, pendingCustomReply: null,
  replyText: null, lineUserId: null, aiReplyGeneratedAt: null, copiedAt: null, postedAt: null,
  repliedAt: null, createdAt: timestamp, updatedAt: timestamp,
};

export const schoolFixture = <T extends Partial<School>>(overrides: T) => ({ ...school, ...overrides });
export const schoolSettingFixture = <T extends Partial<SchoolSetting>>(overrides: T) => ({ ...schoolSetting, ...overrides });
export const instagramSettingFixture = <T extends Partial<InstagramSetting>>(overrides: T) => ({ ...instagramSetting, ...overrides });
export const googleAccountFixture = <T extends Partial<GoogleAccount>>(overrides: T) => ({ ...googleAccount, ...overrides });
export const surveyFixture = <T extends Partial<Survey>>(overrides: T) => ({ ...survey, ...overrides });
export const reviewFixture = <T extends Partial<Review>>(overrides: T) => ({ ...review, ...overrides });
