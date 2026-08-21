import SurveyClient from "./survey-client";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ surveyId?: string }>;
};

export default async function SurveyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { surveyId = "" } = await searchParams;
  let initialData = null;
  let initialDebugError = "";

  try {
    initialData = await buildPublicSurveyResponse({
      schoolId: id,
      surveyId,
    });
  } catch (error) {
    console.error("[SurveyPage] server fetch failed", error);
    initialDebugError =
      error instanceof Error
        ? JSON.stringify(
            {
              source: "server-component",
              message: error.message,
              stack: error.stack,
            },
            null,
            2,
          )
        : JSON.stringify({ source: "server-component", message: String(error) });
  }

  return (
    <SurveyClient
      schoolId={id}
      surveyId={surveyId}
      initialData={initialData}
      initialDebugError={initialDebugError}
    />
  );
}
