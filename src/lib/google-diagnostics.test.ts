import { expect, it } from "vitest";
import { googleDiagnostic, googleFailureDetail } from "./google-diagnostics";
it("only returns allowlisted stages and valid numeric HTTP states", () => {
  for (const value of [null, undefined, "token", { stage: "https://auth.invalid/private", httpStatus: "400" }, { httpStatus: 600 }, { httpStatus: 99 }, { httpStatus: 200.5 }]) {
    expect(googleDiagnostic(value)).toEqual({ stage: "UNKNOWN", httpStatus: null });
  }
  expect(googleDiagnostic({ stage: "OAUTH", httpStatus: 400, token: "private", error: "private" })).toEqual({ stage: "OAUTH", httpStatus: 400 });
  expect(googleFailureDetail({ stage: "OAUTH", httpStatus: 400 })).toContain("認証情報の更新で失敗しました（HTTP 400）");
  expect(googleFailureDetail({ stage: "unsafe" })).toContain("HTTP状態は未確認");
  expect(googleFailureDetail({ stage: "DB_SAVE", httpStatus: null })).toContain("情報不足のため未判定");
});
