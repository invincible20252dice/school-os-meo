import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/survey-persistence", async () => {
  const actual = await vi.importActual<typeof import("@/lib/survey-persistence")>(
    "@/lib/survey-persistence",
  );

  return {
    ...actual,
    persistSurveyResponse: vi.fn(async () => ({ id: "review-1" })),
  };
});

describe("POST /api/survey-responses", () => {
  it("persists a survey response", async () => {
    const persistence = await import("@/lib/survey-persistence");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/survey-responses", {
        method: "POST",
        body: JSON.stringify({
          schoolId: "school-demo-001",
          rating: 5,
          selectedReasons: ["丁寧"],
          freeText: "よかったです",
          generatedReviews: ["口コミ案"],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(persistence.persistSurveyResponse).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        schoolId: "school-demo-001",
      }),
    );
  });

  it("uses the default school when school id is missing", async () => {
    const persistence = await import("@/lib/survey-persistence");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/survey-responses", {
        method: "POST",
        body: JSON.stringify({ schoolId: "" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.review).toEqual({ id: "review-1" });
    expect(persistence.persistSurveyResponse).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ schoolId: "default-school" }),
    );
  });

  it("returns the generic message for unknown persistence failures", async () => {
    const persistence = await import("@/lib/survey-persistence");
    vi.mocked(persistence.persistSurveyResponse).mockRejectedValueOnce("failed");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/survey-responses", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-demo-001" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "アンケート回答を保存できませんでした。時間をおいて再度お試しください。",
    );
  });

  it("does not expose raw database errors", async () => {
    const persistence = await import("@/lib/survey-persistence");
    vi.mocked(persistence.persistSurveyResponse).mockRejectedValueOnce(
      new Error("Prisma P2003 Foreign key constraint failed"),
    );
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/survey-responses", {
        method: "POST",
        body: JSON.stringify({ schoolId: "school-demo-001" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe(
      "保存先の校舎情報を確認できませんでした。時間をおいて再度お試しください。",
    );
    expect(body.message).not.toContain("Prisma");
  });
});
