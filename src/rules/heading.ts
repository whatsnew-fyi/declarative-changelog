import { ALL_TAGS, CHANNEL_LIKE_PRERELEASE } from "../constants.js";
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
          message: `Unknown tag \`${tag}\` — the vocabulary is closed: ${ALL_TAGS.join(", ")}. A channel belongs in the escape hatch (\`channel:\`); a consumer drops the token and keeps the release`,
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
    }

    // A channel wearing a pre-release's syntax: `338.13-Stable` is, per the
    // grammar, a pre-release named `Stable`.
    const firstIdent = entry.version?.prerelease?.split(".")[0]?.toLowerCase();
    if (
      firstIdent !== undefined &&
      (CHANNEL_LIKE_PRERELEASE as readonly string[]).includes(firstIdent)
    ) {
      out.push({
        rule: "heading/channel-as-prerelease",
        severity: "warning",
        message: `The pre-release part of \`${entry.version!.raw}\` starts with \`${firstIdent}\`, which reads like a channel — a channel belongs in the escape hatch (\`channel:\`)`,
        position: entry.position,
      });
    }
  }

  for (const skipped of model.skipped) {
    if (skipped.candidate) {
      // A heading with a date in it was almost certainly meant to be a
      // release; skipping it silently would delete a release from every
      // aggregator with no one the wiser.
      const diagnosis = skipped.nearMiss ? ` — ${skipped.nearMiss}` : "";
      out.push({
        rule: "heading/candidate-does-not-parse",
        severity: "error",
        message: `\`## ${skipped.text}\` contains a date but does not parse under the release-heading grammar${diagnosis}; consumers skip it`,
        position: skipped.position,
      });
    } else if (skipped.text.trim().toLowerCase() !== "unreleased") {
      out.push({
        rule: "heading/skipped",
        severity: "info",
        message: `\`## ${skipped.text}\` contains no date, so it is not a release-heading candidate; consumers skip it`,
        position: skipped.position,
      });
    }
  }

  return out;
}
