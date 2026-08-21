import SurveyClient from "./[id]/survey-client";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

type PageProps = {
  searchParams: Promise<{ schoolId?: string; surveyId?: string }>;
};

export default async function SurveyQueryPage({ searchParams }: PageProps) {
  const { schoolId = "", surveyId = "" } = await searchParams;
  const initialData =
    schoolId || surveyId
      ? await buildPublicSurveyResponse({ schoolId, surveyId }).catch((error) => {
          console.error(error);
          return null;
        })
      : null;

  return (
    <SurveyClient
      schoolId={schoolId}
      surveyId={surveyId}
      initialData={initialData}
    />
  );
}
