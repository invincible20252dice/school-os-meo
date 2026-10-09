// A scheduled run is intentionally unavailable until the manual live-data gate passes.
export async function analyzeAndStoreAioScores() {
  return { enabled: false, code: "MANUAL_VERIFICATION_REQUIRED", analyzed: 0, stored: 0 };
}
