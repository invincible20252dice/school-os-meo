import { expect, it } from "vitest";
import { analyzeAndStoreAioScores } from "./aio-cron";
it("does not measure samples or write data before manual verification", async () => {
  expect(await analyzeAndStoreAioScores()).toEqual({ enabled: false, code: "MANUAL_VERIFICATION_REQUIRED", analyzed: 0, stored: 0 });
});
