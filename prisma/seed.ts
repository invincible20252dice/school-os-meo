import {
  PrismaClient,
  QuestionType,
  Role,
  SchoolStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const demoSchoolId = "school_demo_001";

async function main() {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL?.trim() || "admin@juku-meo.local";
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || "本部管理者";
  const adminPasswordHash =
    process.env.SEED_ADMIN_PASSWORD_HASH?.trim() || undefined;

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      role: Role.HEADQUARTERS,
      ...(adminPasswordHash ? { passwordHash: adminPasswordHash } : {}),
    },
    create: {
      id: "admin_hq_001",
      email: adminEmail,
      name: adminName,
      role: Role.HEADQUARTERS,
      ...(adminPasswordHash ? { passwordHash: adminPasswordHash } : {}),
    },
  });

  const school = await prisma.school.upsert({
    where: { id: demoSchoolId },
    update: {
      ownerId: admin.id,
      name: "青葉ゼミナール デモ校",
      brandName: "塾MEO",
      status: SchoolStatus.ACTIVE,
      postalCode: "160-0023",
      prefecture: "東京都",
      city: "新宿区",
      addressLine: "西新宿1-1-1",
      phoneNumber: "03-0000-0000",
      websiteUrl: "https://example.com",
      googlePlaceId: "demo-google-place-id-001",
      googleMapsUrl:
        "https://search.google.com/local/writereview?placeid=demo-google-place-id-001",
      gbpAccountId: "gbp_demo_account_001",
      gbpLocationId: "gbp_demo_location_001",
      aiSearchPrompt:
        "新宿区の学習塾として、最寄り駅と市区町村名を含めた自然な表現で紹介してください。",
    },
    create: {
      id: demoSchoolId,
      ownerId: admin.id,
      name: "青葉ゼミナール デモ校",
      brandName: "塾MEO",
      status: SchoolStatus.ACTIVE,
      postalCode: "160-0023",
      prefecture: "東京都",
      city: "新宿区",
      addressLine: "西新宿1-1-1",
      phoneNumber: "03-0000-0000",
      websiteUrl: "https://example.com",
      googlePlaceId: "demo-google-place-id-001",
      googleMapsUrl:
        "https://search.google.com/local/writereview?placeid=demo-google-place-id-001",
      gbpAccountId: "gbp_demo_account_001",
      gbpLocationId: "gbp_demo_location_001",
      aiSearchPrompt:
        "新宿区の学習塾として、最寄り駅と市区町村名を含めた自然な表現で紹介してください。",
    },
  });

  await prisma.userSchool.upsert({
    where: {
      userId_schoolId: {
        userId: admin.id,
        schoolId: school.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      schoolId: school.id,
    },
  });

  await prisma.schoolSetting.upsert({
    where: { schoolId: school.id },
    update: {
      lineNotifyEnabled: true,
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      promptReviewTone: "FRIENDLY",
      promptMustKeywords: ["新宿区", "西新宿駅", "学習塾"],
    },
    create: {
      schoolId: school.id,
      lineNotifyEnabled: true,
      notifyOnNewReview: true,
      notifyOnLowRating: true,
      promptSystemRole:
        "学習塾の保護者に伝わる、誠実で自然な口コミ返信文を作成してください。",
      promptReviewTone: "FRIENDLY",
      promptForbiddenWords: [],
      promptMustKeywords: ["新宿区", "西新宿駅", "学習塾"],
    },
  });

  await prisma.surveySetting.upsert({
    where: { id: "survey_setting_demo_rating" },
    update: {
      schoolId: school.id,
      title: "保護者アンケート",
      question: "教室への総合満足度を教えてください",
      type: QuestionType.RATING,
      isRequired: true,
      sortOrder: 1,
      isActive: true,
    },
    create: {
      id: "survey_setting_demo_rating",
      schoolId: school.id,
      title: "保護者アンケート",
      question: "教室への総合満足度を教えてください",
      type: QuestionType.RATING,
      isRequired: true,
      sortOrder: 1,
    },
  });

  await prisma.targetKeyword.upsert({
    where: {
      schoolId_keyword_location: {
        schoolId: school.id,
        keyword: "新宿区 学習塾",
        location: "東京都新宿区 西新宿駅周辺",
      },
    },
    update: {
      nearestStation: "西新宿駅",
      municipality: "新宿区",
      latitude: "35.694003",
      longitude: "139.692102",
      radiusMeters: 1500,
      isActive: true,
    },
    create: {
      schoolId: school.id,
      keyword: "新宿区 学習塾",
      location: "東京都新宿区 西新宿駅周辺",
      nearestStation: "西新宿駅",
      municipality: "新宿区",
      latitude: "35.694003",
      longitude: "139.692102",
      radiusMeters: 1500,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
