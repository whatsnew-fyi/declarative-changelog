import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel } from "../parse/document.js";

export function checkIdentity(model: ChangelogModel): Diagnostic[] {
  const out: Diagnostic[] = [];

  // Entries MUST appear newest first.
  let previousMs: number | undefined;
  let previousRaw: string | undefined;
  for (const entry of model.entries) {
    if (!entry.date.valid) continue;
    if (previousMs !== undefined && entry.date.ms > previousMs) {
      out.push({
        rule: "order/not-newest-first",
        severity: "error",
        message: `Entries must be newest first: \`${entry.date.raw}\` appears below \`${previousRaw}\``,
        position: entry.position,
      });
    }
    previousMs = entry.date.ms;
    previousRaw = entry.date.raw;
  }

  // Two entries resolving to the same identifier is a validation error.
  const seen = new Map<string, string>();
  for (const entry of model.entries) {
    const at = seen.get(entry.id);
    if (at !== undefined) {
      out.push({
        rule: "identity/duplicate-id",
        severity: "error",
        message: `Duplicate entry identifier \`${entry.id}\` (also derived at ${at}) — resolve it with an explicit \`id\` in the escape hatch`,
        position: entry.position,
      });
    } else {
      seen.set(entry.id, `line ${entry.position.line}`);
    }
  }

  return out;
}
