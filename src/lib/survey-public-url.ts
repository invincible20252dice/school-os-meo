function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function buildSurveyPublicUrl(baseUrl: string, schoolId: string) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedSchoolId = schoolId.trim();

  if (!normalizedBaseUrl) {
    throw new Error("公開URLの基準URLを取得できませんでした。");
  }

  if (!normalizedSchoolId) {
    throw new Error("アンケート公開URLを作成する校舎IDがありません。");
  }

  return `${normalizedBaseUrl}/survey/${encodeURIComponent(normalizedSchoolId)}`;
}
