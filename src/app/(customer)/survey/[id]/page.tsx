import SurveyClient from "./survey-client";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ surveyId?: string }>;
};

export default async function SurveyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { surveyId = "" } = await searchParams;
  const initialData = await buildPublicSurveyResponse({
    schoolId: id,
    surveyId,
  }).catch((error) => {
    console.error(error);
    return null;
  });

  return <SurveyClient schoolId={id} surveyId={surveyId} initialData={initialData} />;
}
