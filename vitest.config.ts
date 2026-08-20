import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // cli.ts is exercised end-to-end in a child process, which v8 coverage
      // cannot observe from the parent.
      exclude: ["src/cli.ts"],
      reporter: ["text", "html", "lcov"],
    },
  },
});
