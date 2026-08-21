function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function buildSurveyPublicUrl(
  baseUrl: string,
  schoolId: string,
  surveyId?: string,
) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedSchoolId = schoolId.trim();
  const normalizedSurveyId = surveyId?.trim() || "";

  if (!normalizedBaseUrl) {
    throw new Error("公開URLの基準URLを取得できませんでした。");
  }

  if (!normalizedSchoolId) {
    throw new Error("アンケート公開URLを作成する校舎IDがありません。");
  }

  const url = new URL(`${normalizedBaseUrl}/survey`);
  url.searchParams.set("schoolId", normalizedSchoolId);

  if (normalizedSurveyId) {
    url.searchParams.set("surveyId", normalizedSurveyId);
  }

  return url.toString();
}
