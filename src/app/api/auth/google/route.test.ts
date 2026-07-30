import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalEnv = process.env;

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      GOOGLE_REDIRECT_URI: "",
      NEXT_PUBLIC_APP_URL: "",
      NEXT_PUBLIC_SITE_URL: "",
      NGROK_URL: "",
    };
  });

  it("redirects to Google OAuth with business manage scope", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/google?schoolId=school-1",
      ),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(response.status).toBe(307);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("state")).toBe("school-1");
    expect(location.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/business.manage",
    );
  });

  it("uses the default demo school state when school id is omitted", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/auth/google"),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.searchParams.get("state")).toBe("school-demo-001");
  });

  it("redirects back to settings when Google client id is missing", async () => {
    process.env.GOOGLE_CLIENT_ID = "";

    const response = await GET(
      new Request("https://app.example.com/api/auth/google?schoolId=school-1"),
    );
    const location = new URL(response.headers.get("location") || "");

    expect(location.pathname).toBe("/dashboard/settings/google");
    expect(location.searchParams.get("google_error")).toContain(
      "GOOGLE_CLIENT_ID",
    );
  });
});
