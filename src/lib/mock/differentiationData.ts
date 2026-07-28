export type RoiChannel = {
  id: string;
  label: string;
  conversions: number;
  color: string;
};

export type RoiDashboardData = {
  trialApplications: number;
  estimatedEnrollmentContributionYen: number;
  monthlyFeeYen: number;
  roiPercent: number;
  channels: RoiChannel[];
};

export type ResultPostInput = {
  grade: string;
  schoolName: string;
  result: string;
  subject: string;
  areaKeyword: string;
  comment: string;
};

export type ResultPostPreview = {
  gbp: string;
  instagram: string;
  line: string;
  imageText: string;
};

export type RetentionAlertStatus = "未対応" | "対応中" | "完了";

export type RetentionAlert = {
  id: string;
  rating: 1 | 2 | 3;
  guardianSegment: string;
  category: string;
  answeredAt: string;
  status: RetentionAlertStatus;
  aiAdvice: string;
};

export type LocalCompetitor = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  appealPoint: string;
};

export type SchoolDistrictAnalysis = {
  id: string;
  district: string;
  ownAppealPoint: string;
  competitors: LocalCompetitor[];
  aiMessage: string;
};

export type DifferentiationData = {
  roi: RoiDashboardData;
  resultPost: {
    input: ResultPostInput;
    preview: ResultPostPreview;
  };
  retentionAlerts: RetentionAlert[];
  schoolDistricts: SchoolDistrictAnalysis[];
};

const defaultResultPostInput: ResultPostInput = {
  grade: "〇〇中学2年",
  schoolName: "熊本市立白川中学校",
  result: "定期テスト数学20点UP",
  subject: "数学",
  areaKeyword: "白川中学校",
  comment: "苦手単元を毎週の個別演習で復習し、解き直しの習慣が定着しました。",
};

export function buildResultPostPreview(
  input: ResultPostInput = defaultResultPostInput,
): ResultPostPreview {
  return {
    gbp: `${input.areaKeyword}エリアで${input.subject}対策に取り組む${input.schoolName}の${input.grade}の生徒さんが、${input.result}を達成しました。${input.comment} 学習習慣づくりから定期テスト対策まで、地域の学校進度に合わせてサポートします。`,
    instagram: `【${input.result}】${input.grade}が努力の成果を出しました。${input.comment} #${input.areaKeyword} #${input.subject}対策 #個別指導塾 #成績アップ`,
    line: `${input.grade}の保護者さまへ。${input.result}、本当におめでとうございます。次回面談では、今回伸びた学習習慣を継続するための家庭学習プランも共有します。`,
    imageText: `${input.result}\n${input.grade}\n${input.subject}の苦手克服`,
  };
}

const mockDifferentiationData: DifferentiationData = {
  roi: {
    trialApplications: 18,
    estimatedEnrollmentContributionYen: 1620000,
    monthlyFeeYen: 120000,
    roiPercent: 1350,
    channels: [
      { id: "gbp-web", label: "GBPウェブサイトボタン", conversions: 8, color: "#147d68" },
      { id: "line-survey", label: "LINE連携アンケート", conversions: 6, color: "#2c8fb8" },
      { id: "instagram", label: "Instagram経由", conversions: 4, color: "#d99a22" },
    ],
  },
  resultPost: {
    input: defaultResultPostInput,
    preview: buildResultPostPreview(defaultResultPostInput),
  },
  retentionAlerts: [
    {
      id: "alert-001",
      rating: 2,
      guardianSegment: "中2 / 定期テスト対策",
      category: "宿題量",
      answeredAt: "2026-07-27 21:10",
      status: "未対応",
      aiAdvice: "次回の面談で宿題量の負担感を確認し、優先問題を絞った学習計画へ調整してください。",
    },
    {
      id: "alert-002",
      rating: 3,
      guardianSegment: "小6 / 中学準備",
      category: "連絡頻度",
      answeredAt: "2026-07-26 18:42",
      status: "対応中",
      aiAdvice: "授業後コメントの頻度を週1回へ増やし、家庭で見える進捗を短く共有する対応を推奨します。",
    },
    {
      id: "alert-003",
      rating: 1,
      guardianSegment: "中3 / 高校受験",
      category: "進路相談",
      answeredAt: "2026-07-25 20:15",
      status: "未対応",
      aiAdvice: "志望校判定と直近模試の分析をもとに、48時間以内の個別面談設定を推奨します。",
    },
  ],
  schoolDistricts: [
    {
      id: "district-001",
      district: "白川中学校区",
      ownAppealPoint: "定期テスト補習と学校別カリキュラム",
      competitors: [
        { id: "comp-001", name: "A塾", rating: 4.5, reviewCount: 86, appealPoint: "進学実績" },
        { id: "comp-002", name: "B個別", rating: 4.2, reviewCount: 54, appealPoint: "料金の安さ" },
        { id: "comp-003", name: "Cゼミ", rating: 4.0, reviewCount: 41, appealPoint: "自習室" },
      ],
      aiMessage: "今月は「白川中の定期テスト範囲に合わせた補習対応」を前面に出すと、進学実績訴求の競合と差別化できます。",
    },
    {
      id: "district-002",
      district: "熊本駅前エリア",
      ownAppealPoint: "駅近と部活後の通塾しやすさ",
      competitors: [
        { id: "comp-004", name: "駅前進学館", rating: 4.4, reviewCount: 72, appealPoint: "高校受験特化" },
        { id: "comp-005", name: "個別ラボ", rating: 4.1, reviewCount: 39, appealPoint: "講師指名" },
      ],
      aiMessage: "「部活帰りでも通いやすい駅前個別指導」と「短時間集中の演習管理」をセットで訴求してください。",
    },
  ],
};

export function buildDifferentiationData(): DifferentiationData {
  return mockDifferentiationData;
}

export function calculateRoiPercent(
  estimatedEnrollmentContributionYen: number,
  monthlyFeeYen: number,
): number {
  if (monthlyFeeYen <= 0) {
    return 0;
  }

  return Math.round((estimatedEnrollmentContributionYen / monthlyFeeYen) * 100);
}

export function getRetentionAlertCounts(alerts: RetentionAlert[] = []) {
  return {
    total: alerts.length,
    unresolved: alerts.filter((alert) => alert?.status !== "完了").length,
    critical: alerts.filter((alert) => (alert?.rating ?? 5) <= 2).length,
  };
}

export function findDistrictAnalysis(
  districts: SchoolDistrictAnalysis[] = [],
  district: string,
) {
  return (
    districts.find((item) => item?.district === district) ?? districts[0] ?? null
  );
}
