import SurveyClient from "./[id]/survey-client";

type PageProps = {
  searchParams: Promise<{ schoolId?: string; surveyId?: string }>;
};

export default async function SurveyQueryPage({ searchParams }: PageProps) {
  const { schoolId = "", surveyId = "" } = await searchParams;

  return <SurveyClient schoolId={schoolId} surveyId={surveyId} />;
}
