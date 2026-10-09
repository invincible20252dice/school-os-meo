import { expect, it } from "vitest";
import { measurementState, type MeasurementView } from "./aio-view";
it("separates unmeasured and missing settings", () => {
  expect(measurementState(null, true)).toEqual({ label: "未計測", value: "—" });
  expect(measurementState(null, false)).toEqual({ label: "設定が必要", value: "—" });
});
it.each([
  ["SUCCESS", false, "計測成功", "0%"], ["SUCCESS", true, "計測成功", "100%"],
  ["FAILED", null, "計測失敗", "—"], ["CONFIG_REQUIRED", null, "設定が必要", "—"],
  ["RUNNING", null, "計測中", "—"],
])("renders %s independently of numeric fallbacks", (status, recommended, label, value) => {
  const record = { status, recommended, brandDetected: false, score: 0, measuredAt: new Date().toISOString(), createdAt: new Date().toISOString() } as MeasurementView;
  expect(measurementState(record, true)).toEqual({ label, value });
});
it("does not accept stale running or malformed success as zero", () => {
  expect(measurementState({ status: "RUNNING", createdAt: "2020-01-01" } as MeasurementView, true).label).toBe("計測失敗");
  expect(measurementState({ status: "SUCCESS", recommended: null } as MeasurementView, true).value).toBe("—");
});
