import { formatInstagramCaptionForGbp } from "./ai-formatter";
import { fetchLatestInstagramMedia, type InstagramMedia } from "./instagram";
import { assertInstagramSyncSchema, InstagramSyncUnavailableError, requireInstagramSyncEndpoint, requireSyncValue, type InstagramSyncSchemaClient } from "./instagram-sync-readiness";

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

type PrismaInstagramSyncClient = InstagramSyncSchemaClient & {
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
  endpoint,
}: {
  school: InstagramSettingRecord["school"];
  media: InstagramMedia;
  formattedText: string;
  fetchImpl: FetchLike;
  endpoint: string;
}) {
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
  schoolId,
}: {
  prisma: PrismaInstagramSyncClient;
  fetchImpl?: FetchLike;
  schoolId?: string;
}) {
  await assertInstagramSyncSchema(prisma);
  const settings = await prisma.instagramSetting.findMany({
    where: {
      autoSyncEnabled: true,
      ...(schoolId ? { schoolId } : {}),
    },
    select: {
      id: true,
      schoolId: true,
      instagramAccessToken: true,
      instagramBusinessAccountId: true,
      autoSyncEnabled: true,
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

  if (settings.length === 0) return summary;
  const endpoint = requireInstagramSyncEndpoint();
  // Check the entire batch before any provider call, not lazily inside its loop.
  for (const value of settings) {
    const setting = value as InstagramSettingRecord;
    if (!setting || !setting.school || setting.autoSyncEnabled !== true ||
        setting.school.id !== setting.schoolId || (schoolId && setting.schoolId !== schoolId)) {
      throw new InstagramSyncUnavailableError();
    }
    for (const required of [setting.id, setting.schoolId, setting.instagramAccessToken,
      setting.instagramBusinessAccountId, setting.school.name, setting.school.gbpLocationId]) {
      requireSyncValue(required);
    }
  }

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
        endpoint,
      });

      await prisma.syncedPost.create({
        select: { id: true },
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
        select: { id: true },
        where: { id: setting.id },
        data: { lastSyncedAt: new Date() },
      });
      summary.posted += 1;
    }
  }

  return summary;
}
