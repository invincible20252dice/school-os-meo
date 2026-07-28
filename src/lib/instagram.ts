type FetchLike = typeof fetch;

type InstagramApiMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
};

type InstagramSettingInput = {
  instagramBusinessAccountId: string;
  instagramAccessToken: string;
};

export type InstagramMedia = {
  instagramMediaId: string;
  caption: string;
  mediaType: string;
  mediaUrl?: string;
  permalink?: string;
  postedAt: Date;
};

const graphApiVersion = "v21.0";
const mediaFields = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
].join(",");

function parseInstagramTimestamp(value: string) {
  return new Date(value.replace("+0000", "Z"));
}

export function normalizeInstagramMedia(
  media: InstagramApiMedia,
): InstagramMedia {
  return {
    instagramMediaId: media.id,
    caption: media.caption?.trim() || "",
    mediaType: media.media_type,
    mediaUrl: media.media_url || media.thumbnail_url,
    permalink: media.permalink,
    postedAt: parseInstagramTimestamp(media.timestamp),
  };
}

export async function fetchLatestInstagramMedia(
  setting: InstagramSettingInput,
  fetchImpl: FetchLike = fetch,
) {
  const url = new URL(
    `https://graph.facebook.com/${graphApiVersion}/${setting.instagramBusinessAccountId}/media`,
  );
  url.searchParams.set("fields", mediaFields);
  url.searchParams.set("limit", "5");
  url.searchParams.set("access_token", setting.instagramAccessToken);

  const response = await fetchImpl(url.toString());

  if (!response.ok) {
    throw new Error(`Instagram media fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const media = Array.isArray(data.data) ? data.data : [];

  return media.map((item: InstagramApiMedia) => normalizeInstagramMedia(item));
}
