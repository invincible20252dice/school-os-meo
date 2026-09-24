import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
        "src/components/dashboard/navigation.ts",
        "src/app/**/reviews/reviews-client.tsx",
        "src/app/**/dashboard/overview-client.tsx",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/lib/prisma.ts",
        "src/app/api/**/route.test.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
        "src/app/**/reviews/reviews-client.tsx": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/app/**/dashboard/overview-client.tsx": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/lib/dashboard-summary.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/app/api/dashboard/overview/route.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/lib/gbp-direct-reply.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/lib/review-reply-assist.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
        "src/app/api/gbp/reply/route.ts": { lines: 95, functions: 95, branches: 95, statements: 95 },
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
