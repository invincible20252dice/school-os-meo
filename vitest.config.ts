import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
        "src/components/dashboard/navigation.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/lib/prisma.ts",
        "src/app/api/**/route.test.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
