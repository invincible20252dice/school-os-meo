import { formatInstagramCaptionForGbp } from "./ai-formatter";
import type { InstagramMedia } from "./instagram";

export const DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL = {
  id: "cms5tnzlr0001jt04qh0lluva",
  name: "iスクール予備校",
  gbpLocationId: "locations/6467241578381534467",
};

export const DEFAULT_INSTAGRAM_LOCATION = {
  keyword: "熊本 大学受験 塾",
  nearestStation: "通町筋駅",
  municipality: "熊本市中央区",
  latitude: 32.8016,
  longitude: 130.7095,
  radiusMeters: 1500,
};

const defaultInstagramMedia: InstagramMedia = {
  instagramMediaId: "mock-instagram-media-001",
  caption:
    "下通校の自習室では、大学受験に向けた個別指導と質問対応を行っています。通町筋・下通エリアで集中して学べる環境づくりを進めています。 #熊本 #大学受験 #個別指導 #下通",
  mediaType: "IMAGE",
  mediaUrl: "https://example.com/ischool-instagram-classroom.jpg",
  permalink: "https://instagram.com/p/mock001",
  postedAt: new Date("2026-07-22T01:00:00.000Z"),
};

export async function buildMockInstagramSyncPreview({
  school = DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL,
  instagram = defaultInstagramMedia,
}: {
  school?: typeof DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL;
  instagram?: InstagramMedia;
} = {}) {
  const formattedText = await formatInstagramCaptionForGbp({
    schoolName: school.name,
    caption: instagram.caption,
  });
  const gbpPostPayload = {
    locationId: school.gbpLocationId,
    summary: formattedText,
    media: [
      {
        mediaFormat: "PHOTO",
        sourceUrl: instagram.mediaUrl,
      },
    ],
  };

  return {
    safety:
      "プレビュー表示のため、ここではInstagram API・OpenAI API・GBP API・DB書き込みは行いません。",
    school,
    instagram,
    formattedText,
    gbpPostPayload,
    mockResult: {
      gbpPostId: "mock-gbp-post-001",
      gbpPostUrl: "https://search.google.com/local/posts/mock-gbp-post-001",
      syncedPostWouldBeSaved: true,
    },
    timeline: [
      "Mock Instagram投稿を取得",
      "AIリライト相当の整形を実行",
      "GBP LocalPost payloadを作成",
      "Mock GBP投稿結果を生成",
      "SyncedPost保存予定の内容を確認",
    ],
  };
}
