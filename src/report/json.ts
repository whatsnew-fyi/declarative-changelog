import type { ValidationResult } from "../index.js";

/** Machine-readable output. `schemaVersion` gates CI consumers across releases. */
export function formatJson(results: readonly ValidationResult[]): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      files: results.map((r) => ({
        file: r.file,
        level: r.level,
        levelName: r.levelName,
        entries: r.entryCount,
        counts: r.counts,
        diagnostics: r.diagnostics,
      })),
      summary: results.reduce(
        (acc, r) => {
          acc.error += r.counts.error;
          acc.warning += r.counts.warning;
          acc.info += r.counts.info;
          return acc;
        },
        { error: 0, warning: 0, info: 0 },
      ),
    },
    null,
    2,
  );
}
