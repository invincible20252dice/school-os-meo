import SurveyEditor from "./survey-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SurveyEditPage({ params }: PageProps) {
  const { id } = await params;

  return <SurveyEditor surveyId={id} />;
}
