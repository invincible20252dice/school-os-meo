import { describe, expect, it, vi } from "vitest";
import {
  assertProductionEnv,
  formatEnvCheckMessage,
  recommendedProductionEnvKeys,
  requiredProductionEnvKeys,
  validateEnv,
} from "./envCheck";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const filledRequiredEnv = Object.fromEntries(
  requiredProductionEnvKeys.map((key) => [key, `${key.toLowerCase()}-value`]),
);

describe("envCheck", () => {
  it("reports missing required keys and treats blank strings as missing", () => {
    const result = validateEnv({
      ...filledRequiredEnv,
      DATABASE_URL: "   ",
      META_APP_SECRET: "",
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["DATABASE_URL", "META_APP_SECRET"]);
    expect(result.present).not.toContain("DATABASE_URL");
  });

  it("passes when all required keys are configured", () => {
    const result = validateEnv(filledRequiredEnv);

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual([...requiredProductionEnvKeys]);
  });

  it("formats explicit failure and warning messages", () => {
    const result = validateEnv(
      { NEXT_PUBLIC_APP_URL: "https://app.example.com" },
      ["NEXT_PUBLIC_APP_URL", "DATABASE_URL"],
      ["GBP_LOCAL_POSTS_API_URL"],
    );

    expect(formatEnvCheckMessage(result)).toContain(
      "Missing required keys: DATABASE_URL",
    );
    expect(formatEnvCheckMessage(result)).toContain(
      "GBP_LOCAL_POSTS_API_URL is not configured.",
    );
  });

  it("logs warnings and throws when production env is incomplete", () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };

    expect(() => assertProductionEnv({}, logger)).toThrow(
      "Production environment check failed.",
    );
    expect(logger.error.mock.calls[0][0]).toContain("DATABASE_URL");
    expect(logger.warn.mock.calls[0][0]).toContain("GBP_API_REVIEWS_URL");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs a success message when the required production env is complete", () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    };
    const env = {
      ...filledRequiredEnv,
      ...Object.fromEntries(
        recommendedProductionEnvKeys.map((key) => [
          key,
          `${key.toLowerCase()}-value`,
        ]),
      ),
    };

    const result = assertProductionEnv(env, logger);

    expect(result.ok).toBe(true);
    expect(logger.info.mock.calls[0][0]).toBe(
      "Production environment check passed.",
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("keeps the CLI check script aligned with the required and recommended key lists", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/check-env.mjs"),
      "utf8",
    );

    for (const key of [
      ...requiredProductionEnvKeys,
      ...recommendedProductionEnvKeys,
    ]) {
      expect(script).toContain(`"${key}"`);
    }
  });
});
