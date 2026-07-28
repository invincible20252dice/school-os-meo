import { formatInstagramCaptionForGbp } from "./ai-formatter";
import { fetchLatestInstagramMedia, type InstagramMedia } from "./instagram";

type FetchLike = typeof fetch;

type InstagramSettingRecord = {
  id: string;
  schoolId: string;
  instagramAccessToken: string;
  instagramBusinessAccountId: string;
  autoSyncEnabled: boolean;
  school: {
    id: string;
    name: string;
    gbpLocationId?: string | null;
  };
};

type PrismaInstagramSyncClient = {
  instagramSetting: {
    findMany(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<unknown>;
  };
  syncedPost: {
    findUnique(args: unknown): Promise<unknown | null>;
    create(args: unknown): Promise<unknown>;
  };
};

async function postToGbpLocalPosts({
  school,
  media,
  formattedText,
  fetchImpl,
}: {
  school: InstagramSettingRecord["school"];
  media: InstagramMedia;
  formattedText: string;
  fetchImpl: FetchLike;
}) {
  const endpoint = process.env.GBP_LOCAL_POSTS_API_URL;

  if (!endpoint) {
    throw new Error("GBP_LOCAL_POSTS_API_URL is not configured.");
  }

  if (!school.gbpLocationId) {
    throw new Error("School does not have gbpLocationId.");
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.GBP_API_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.GBP_API_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      locationId: school.gbpLocationId,
      summary: formattedText,
      media: media.mediaUrl
        ? [
            {
              mediaFormat: media.mediaType === "VIDEO" ? "VIDEO" : "PHOTO",
              sourceUrl: media.mediaUrl,
            },
          ]
        : [],
    }),
  });

  if (!response.ok) {
    throw new Error(`GBP local post failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    gbpPostId: String(data.id || data.name || data.gbpPostId),
    gbpPostUrl: typeof data.searchUrl === "string" ? data.searchUrl : undefined,
  };
}

export async function syncInstagramPosts({
  prisma,
  fetchImpl = fetch,
}: {
  prisma: PrismaInstagramSyncClient;
  fetchImpl?: FetchLike;
}) {
  const settings = await prisma.instagramSetting.findMany({
    where: {
      autoSyncEnabled: true,
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          gbpLocationId: true,
        },
      },
    },
  });
  const summary = {
    settings: settings.length,
    fetched: 0,
    posted: 0,
    skipped: 0,
  };

  for (const settingValue of settings) {
    const setting = settingValue as InstagramSettingRecord;
    const mediaItems = await fetchLatestInstagramMedia(setting, fetchImpl);
    summary.fetched += mediaItems.length;

    for (const media of mediaItems) {
      const existing = await prisma.syncedPost.findUnique({
        where: {
          schoolId_instagramMediaId: {
            schoolId: setting.schoolId,
            instagramMediaId: media.instagramMediaId,
          },
        },
      });

      if (existing) {
        summary.skipped += 1;
        continue;
      }

      const formattedText = await formatInstagramCaptionForGbp(
        {
          schoolName: setting.school.name,
          caption: media.caption,
        },
        fetchImpl,
      );
      const gbpPost = await postToGbpLocalPosts({
        school: setting.school,
        media,
        formattedText,
        fetchImpl,
      });

      await prisma.syncedPost.create({
        data: {
          schoolId: setting.schoolId,
          instagramMediaId: media.instagramMediaId,
          gbpPostId: gbpPost.gbpPostId,
          gbpPostUrl: gbpPost.gbpPostUrl,
          instagramUrl: media.permalink,
          caption: media.caption,
          formattedText,
          syncedAt: new Date(),
        },
      });
      await prisma.instagramSetting.update({
        where: { id: setting.id },
        data: { lastSyncedAt: new Date() },
      });
      summary.posted += 1;
    }
  }

  return summary;
}
