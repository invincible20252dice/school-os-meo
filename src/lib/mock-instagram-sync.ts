import { formatInstagramCaptionForGbp } from "./ai-formatter";
import type { InstagramMedia } from "./instagram";

const mockSchool = {
  id: "mock-school-001",
  name: "青葉ゼミナール 本校",
  gbpLocationId: "mock-gbp-location-001",
};

const mockInstagramMedia: InstagramMedia = {
  instagramMediaId: "mock-instagram-media-001",
  caption:
    "夏期講習が始まりました🌻🌻 苦手単元を一緒に復習し、2学期に向けた学習習慣づくりをサポートします！ #夏期講習 #横浜駅 #個別指導 #塾",
  mediaType: "IMAGE",
  mediaUrl: "https://example.com/mock-instagram-classroom.jpg",
  permalink: "https://instagram.com/p/mock001",
  postedAt: new Date("2026-07-22T01:00:00.000Z"),
};

export async function buildMockInstagramSyncPreview() {
  const formattedText = await formatInstagramCaptionForGbp({
    schoolName: mockSchool.name,
    caption: mockInstagramMedia.caption,
  });
  const gbpPostPayload = {
    locationId: mockSchool.gbpLocationId,
    summary: formattedText,
    media: [
      {
        mediaFormat: "PHOTO",
        sourceUrl: mockInstagramMedia.mediaUrl,
      },
    ],
  };

  return {
    safety:
      "Mock実行のため、Instagram API・OpenAI API・GBP API・DB書き込みは行いません。",
    school: mockSchool,
    instagram: mockInstagramMedia,
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
