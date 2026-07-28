import { afterEach, describe, expect, it } from "vitest";
import {
  createBrowserSupabaseClient,
  createServerSupabaseClient,
} from "./supabase";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("supabase", () => {
  it("fails fast when public Supabase env vars are missing", () => {
    process.env = {};

    expect(() => createBrowserSupabaseClient()).toThrow(
      "Supabase public environment variables are not configured.",
    );
  });

  it("fails fast when server Supabase env vars are missing", () => {
    process.env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    };

    expect(() => createServerSupabaseClient()).toThrow(
      "Supabase server environment variables are not configured.",
    );
  });

  it("creates browser and server clients when required env vars exist", () => {
    process.env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };

    expect(createBrowserSupabaseClient()).toBeTruthy();
    expect(createServerSupabaseClient()).toBeTruthy();
  });
});
