import SurveyClient from "./survey-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SurveyPage({ params }: PageProps) {
  const { id } = await params;

  return <SurveyClient schoolId={id} />;
}
