import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Single-threaded: the rules emulator does not tolerate concurrent
    // clients well across the same DB.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
