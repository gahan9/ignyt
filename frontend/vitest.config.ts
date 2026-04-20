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
      // Hard gate enforced in CI: ``coverage-summary.json`` is read by the
      // workflow and the build fails under 60% line coverage. Local runs
      // still pass if you're below target; ratchet by editing the CI
      // threshold and the comment together.
    },
  },
});
