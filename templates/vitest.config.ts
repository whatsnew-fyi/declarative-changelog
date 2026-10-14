import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each test drives a real release tool over a fresh git repository.
    testTimeout: 60_000,
  },
});
