import { describe, expect, it, vi } from "vitest";
import { analyzeAndStoreAioScores } from "./aio-cron";

describe("aio-cron", () => {
  it("analyzes active target keywords and stores AIO score history", async () => {
    const prisma = {
      targetKeyword: {
        findMany: vi.fn(async () => [
          {
            id: "keyword_1",
            schoolId: "school_1",
            keyword: "横浜駅 個別指導 塾",
            nearestStation: "横浜駅",
            municipality: "横浜市西区",
            school: {
              id: "school_1",
              name: "青葉ゼミナール 本校",
            },
          },
        ]),
      },
      aioScoreHistory: {
        create: vi.fn(async ({ data }) => ({ id: "aio_1", ...data })),
      },
    };

    const summary = await analyzeAndStoreAioScores({ prisma });

    expect(summary).toEqual({ keywords: 1, analyzed: 1, stored: 1 });
    expect(prisma.aioScoreHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school_1",
          keywordId: "keyword_1",
          chatgptScore: expect.any(Number),
          geminiScore: expect.any(Number),
          googleAiScore: expect.any(Number),
          totalScore: expect.any(Number),
          aiMentions: expect.any(Object),
        }),
      }),
    );
  });
});
