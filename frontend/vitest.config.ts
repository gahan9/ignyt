import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // E2E tests live in tests/e2e and are run by Playwright, not Vitest.
    exclude: ["node_modules/**", "tests/e2e/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**",
        "src/hooks/**",
        "src/types/**",
        "src/components/**",
        "src/pages/**",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/**/__tests__/**",
        "src/**/index.ts",
      ],
      // Soft target. CI inspects coverage-summary.json and emits a warning
      // under 60%; it does not fail the build. Raise to a hard threshold
      // once we're consistently above target.
    },
  },
});
