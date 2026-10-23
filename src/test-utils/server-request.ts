import { transferableAbortController } from "node:util";

export function createServerRequest(input: string | URL, init?: RequestInit) {
  if (!init?.signal) return new Request(input, init);
  const controller = transferableAbortController();
  const signal = init.signal;
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return new Request(input, { ...init, signal: controller.signal });
}
