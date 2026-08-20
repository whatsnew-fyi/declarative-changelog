import type { Diagnostic } from "./diagnostics.js";
import type { ChangelogModel, ReleaseEntry } from "./parse/document.js";

/** 0 = not conformant, 1 = Structured, 2 = Categorized. */
export type Level = 0 | 1 | 2;

export function entryLevel(entry: ReleaseEntry): Level {
  return entry.sections.every((s) => s.category) ? 2 : 1;
}

/**
 * Level 1: valid frontmatter, every release heading matches the grammar.
 * Level 2: Level 1, plus every entry's changes under recognized sections.
 * Heading grammar violations surface as skipped-release-like headings and
 * heading errors (bad tag, impossible date), so those gate Level 1.
 */
export function documentLevel(model: ChangelogModel, diagnostics: readonly Diagnostic[]): Level {
  if (!model.hasFrontmatter || !model.frontmatter.valid) return 0;
  const gating = diagnostics.some(
    (d) =>
      (d.severity === "error" &&
        (d.rule.startsWith("frontmatter/") || d.rule.startsWith("heading/"))) ||
      d.rule === "heading/skipped-release-like",
  );
  if (gating) return 0;
  return model.entries.every((e) => entryLevel(e) === 2) ? 2 : 1;
}

export const LEVEL_NAMES: Record<Level, string> = {
  0: "not conformant",
  1: "Level 1 — Structured",
  2: "Level 2 — Categorized",
};
