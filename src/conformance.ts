import type { Diagnostic } from "./diagnostics.js";
import type { ChangelogModel, ReleaseEntry } from "./parse/document.js";

/** 0 = not conformant, 1 = Structured, 2 = Categorized. */
export type Level = 0 | 1 | 2;

/**
 * Level 2's test is structural on purpose: no top-level list outside a
 * recognized `### ` section. An entry with no lists at all passes vacuously —
 * nothing was claimed, nothing is extracted. `bodyNodes` holds everything
 * outside recognized sections (unrecognized `### ` content included), so one
 * scan is the whole check.
 */
export function entryLevel(entry: ReleaseEntry): Level {
  return entry.bodyNodes.some((n) => n.type === "list") ? 1 : 2;
}

/**
 * Level 1 (spec §Conformance): the frontmatter parses under the YAML profile
 * and declares a version whose major this checker understands; every
 * release-heading candidate parses; no duplicate identifiers; entries newest
 * first; no link-only bodies. Vocabulary errors (an unknown tag, say) fail
 * validation but are not structural, so they do not gate the level.
 */
const LEVEL_GATING_RULES = new Set([
  "heading/candidate-does-not-parse",
  "heading/invalid-date",
  "identity/duplicate-id",
  "order/not-newest-first",
  "entry/link-only-body",
]);

export function documentLevel(model: ChangelogModel, diagnostics: readonly Diagnostic[]): Level {
  if (!model.hasFrontmatter || !model.frontmatter.valid) return 0;
  const gating = diagnostics.some(
    (d) =>
      LEVEL_GATING_RULES.has(d.rule) ||
      (d.severity === "error" &&
        (d.rule === "frontmatter/unsupported-version" || d.rule === "frontmatter/invalid-yaml")),
  );
  if (gating) return 0;
  return model.entries.every((e) => entryLevel(e) === 2) ? 2 : 1;
}

/**
 * Addressability is a property, not a level: whether every entry has its own
 * URL — a heading link or a hatch `url:`, never the canonical/homepage
 * fallback. Reported alongside the level.
 */
export function addressableEntryCount(model: ChangelogModel): number {
  return model.entries.filter((e) => e.url !== undefined).length;
}

export const LEVEL_NAMES: Record<Level, string> = {
  0: "not conformant",
  1: "Level 1 — Structured",
  2: "Level 2 — Categorized",
};
