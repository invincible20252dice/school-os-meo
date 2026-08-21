import SurveyClient from "./survey-client";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ surveyId?: string }>;
};

export default async function SurveyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { surveyId = "" } = await searchParams;

  return <SurveyClient schoolId={id} surveyId={surveyId} />;
}
