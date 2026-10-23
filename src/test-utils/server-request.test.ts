import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createServerRequest } from "./server-request";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new () => { window: { AbortController: typeof AbortController; close(): void } };
};

describe("browser to server request adapter", () => {
  it("preserves headers, method and body", async () => {
    const browser = new JSDOM();
    try {
      const request = createServerRequest("https://school.test", {
        method: "POST", headers: { "x-test": "synthetic" }, body: "payload",
        signal: new browser.window.AbortController().signal,
      });
      expect(request.method).toBe("POST");
      expect(request.headers.get("x-test")).toBe("synthetic");
      expect(await request.text()).toBe("payload");
    } finally { browser.window.close(); }
  });

  it("preserves subsequent browser cancellation", () => {
    const browser = new JSDOM();
    try {
      const controller = new browser.window.AbortController();
      const request = createServerRequest("https://school.test", { signal: controller.signal });
      expect(request.signal.aborted).toBe(false);
      controller.abort("cancelled");
      expect(request.signal.aborted).toBe(true);
      expect(request.signal.reason).toBe("cancelled");
    } finally { browser.window.close(); }
  });

  it("preserves existing cancellation", () => {
    const browser = new JSDOM();
    try {
      const controller = new browser.window.AbortController();
      controller.abort("already-cancelled");
      const request = createServerRequest("https://school.test", { signal: controller.signal });
      expect(request.signal.aborted).toBe(true);
      expect(request.signal.reason).toBe("already-cancelled");
    } finally { browser.window.close(); }
  });

  it("accepts requests without cancellation", () => {
    expect(createServerRequest("https://school.test").signal.aborted).toBe(false);
  });
});
