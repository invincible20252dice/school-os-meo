import SurveyClient from "./[id]/survey-client";
import { buildPublicSurveyResponse } from "@/lib/public-survey-query";

type PageProps = {
  searchParams: Promise<{ schoolId?: string; surveyId?: string }>;
};

export default async function SurveyQueryPage({ searchParams }: PageProps) {
  const { schoolId = "", surveyId = "" } = await searchParams;
  let initialData = null;
  let initialDebugError = "";

  if (schoolId || surveyId) {
    try {
      initialData = await buildPublicSurveyResponse({ schoolId, surveyId });
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
  }

  return (
    <SurveyClient
      schoolId={schoolId}
      surveyId={surveyId}
      initialData={initialData}
      initialDebugError={initialDebugError}
    />
  );
}
