// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import Page from "./page";
import DemandPage from "../demand/page";
afterEach(cleanup);
it("shares the demand route and identifies sample data", () => {
  expect(DemandPage).toBe(Page);
  render(<Page />);
  expect(screen.getByRole("note").textContent).toContain("実測値ではありません");
  expect(screen.getByRole("status").textContent).toContain("熊本市中央区（4件）");
});
it("filters all regions immediately with accessible selection states", () => {
  render(<Page />);
  for (const [district, count, first] of [["東区", 3, "熊本市東区 塾 個別指導"], ["西区", 3, "熊本駅 予備校 大学受験"], ["全地域", 10, "熊本市中央区 個別指導 塾"], ["熊本市中央区", 4, "熊本市中央区 個別指導 塾"]] as const) {
    fireEvent.click(screen.getByRole("button", { name: district }));
    expect(screen.getByRole("button", { name: district }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("button").filter(button => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(count);
    expect(within(rows[0]).getByText(first)).toBeDefined();
    if (district !== "全地域") for (const row of rows) expect(within(row).getByText(district)).toBeDefined();
  }
  expect(screen.getByText("-4%")).toBeDefined();
  expect(screen.getByText("+18%")).toBeDefined();
});
