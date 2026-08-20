import { ALL_TAGS } from "../constants.js";
import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel } from "../parse/document.js";

export function checkHeadings(model: ChangelogModel): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const entry of model.entries) {
    for (const tag of entry.tags) {
      if (!(ALL_TAGS as readonly string[]).includes(tag)) {
        out.push({
          rule: "heading/unknown-tag",
          severity: "error",
          message: `Unknown tag \`${tag}\` — the vocabulary is closed: ${ALL_TAGS.join(", ")}. A channel belongs in the escape hatch (\`channel:\`)`,
          position: entry.position,
        });
      }
    }
    const seen = new Set<string>();
    for (const tag of entry.tags) {
      if (seen.has(tag)) {
        out.push({
          rule: "heading/duplicate-tag",
          severity: "warning",
          message: `Duplicate tag \`${tag}\``,
          position: entry.position,
        });
      }
      seen.add(tag);
    }

    if (!entry.date.valid) {
      out.push({
        rule: "heading/invalid-date",
        severity: "error",
        message: `\`${entry.date.raw}\` is not a real calendar date/time`,
        position: entry.position,
      });
    } else if (!entry.date.hasTime) {
      out.push({
        rule: "heading/date-only",
        severity: "info",
        message:
          "Date-only value — it means midnight UTC and is a lossy sort key; a time and offset are recommended",
        position: entry.position,
      });
    } else if (!entry.date.hasOffset) {
      out.push({
        rule: "heading/offset-missing",
        severity: "info",
        message: "Time without a UTC offset — consumers will read it as UTC",
        position: entry.position,
      });
    }
  }

  for (const skipped of model.skipped) {
    if (skipped.text.trim().toLowerCase() === "unreleased") continue; // blessed by the spec
    if (skipped.smellsLikeRelease) {
      out.push({
        rule: "heading/skipped-release-like",
        severity: "warning",
        message: `\`## ${skipped.text}\` does not match the release-heading grammar and will be skipped by consumers — it looks like it was meant to be a release heading`,
        position: skipped.position,
      });
    } else {
      out.push({
        rule: "heading/skipped",
        severity: "info",
        message: `\`## ${skipped.text}\` does not match the release-heading grammar; consumers skip it`,
        position: skipped.position,
      });
    }
  }

  return out;
}
