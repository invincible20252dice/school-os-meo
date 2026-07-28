import { analyzeAioVisibility } from "./aio-analyzer";

type TargetKeywordForAio = {
  id: string;
  schoolId: string;
  keyword: string;
  nearestStation: string;
  municipality: string;
  school: {
    id: string;
    name: string;
  };
};

type PrismaAioClient = {
  targetKeyword: {
    findMany(args: unknown): Promise<unknown[]>;
  };
  aioScoreHistory: {
    create(args: unknown): Promise<unknown>;
  };
};

export async function analyzeAndStoreAioScores({
  prisma,
}: {
  prisma: PrismaAioClient;
}) {
  const keywords = await prisma.targetKeyword.findMany({
    where: {
      isActive: true,
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  const summary = {
    keywords: keywords.length,
    analyzed: 0,
    stored: 0,
  };

  for (const keywordValue of keywords) {
    const keyword = keywordValue as TargetKeywordForAio;
    const result = await analyzeAioVisibility({
      ownSchoolName: keyword.school.name,
      keyword: keyword.keyword,
      nearestStation: keyword.nearestStation,
      municipality: keyword.municipality,
      competitorNames: [],
    });

    summary.analyzed += 1;
    await prisma.aioScoreHistory.create({
      data: {
        schoolId: keyword.schoolId,
        keywordId: keyword.id,
        chatgptScore: result.chatgptScore,
        geminiScore: result.geminiScore,
        googleAiScore: result.googleAiScore,
        totalScore: result.totalScore,
        aiMentions: result.aiMentions,
        checkedAt: new Date(),
      },
    });
    summary.stored += 1;
  }

  return summary;
}
