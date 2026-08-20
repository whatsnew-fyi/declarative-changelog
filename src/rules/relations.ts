import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel } from "../parse/document.js";

export interface ArchiveIdentifiers {
  versions: Set<string>;
  ids: Set<string>;
  /** URLs that could not be fetched, if any. */
  failures: string[];
}

export interface RelationContext {
  /** Identifiers collected by following `document.older`, when `--follow-older` is on. */
  archive?: ArchiveIdentifiers;
}

const normalize = (v: string) => v.replace(/^v/, "");

export function checkRelations(model: ChangelogModel, ctx: RelationContext = {}): Diagnostic[] {
  const out: Diagnostic[] = [];

  const versions = new Set<string>();
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const entry of model.entries) {
    if (entry.version) versions.add(normalize(entry.version.raw));
    ids.add(entry.id);
    for (const v of entry.covers ?? []) covered.add(normalize(v));
  }

  for (const [index, entry] of model.entries.entries()) {
    if (entry.yanked && entry.supersededBy === undefined) {
      out.push({
        rule: "relation/yanked-without-superseded-by",
        severity: "warning",
        message:
          "A yanked entry should carry `superseded-by` — telling a reader to leave without telling them where to go is half an instruction",
        position: entry.position,
      });
    }

    const target = entry.supersededBy;
    if (target === undefined) continue;

    // In-document resolution lands on an entry, or on the entry covering the
    // named version. The archive chain is deliberately the soft case.
    const inDocument =
      versions.has(normalize(target)) || ids.has(target) || covered.has(normalize(target));
    const inArchive =
      ctx.archive !== undefined &&
      (ctx.archive.versions.has(normalize(target)) || ctx.archive.ids.has(target));

    if (!inDocument) {
      if (inArchive) {
        out.push({
          rule: "relation/superseded-by-archive-only",
          severity: "warning",
          message: `\`superseded-by: ${target}\` resolves only through the archive chain at \`document.older\``,
          position: entry.hatch?.position ?? entry.position,
        });
      } else if (model.frontmatter.document.older !== undefined && ctx.archive === undefined) {
        out.push({
          rule: "relation/superseded-by-unresolved",
          severity: "warning",
          message: `\`superseded-by: ${target}\` does not resolve in this document; the archive chain at \`document.older\` was not followed (pass --follow-older to check it)`,
          position: entry.hatch?.position ?? entry.position,
        });
      } else {
        out.push({
          rule: "relation/superseded-by-unresolved",
          severity: "error",
          message: `\`superseded-by: ${target}\` does not name an entry that exists — dangling in-document is an error, not a hint`,
          position: entry.hatch?.position ?? entry.position,
        });
      }
      if (!inArchive) continue;
    }

    // Meaningful only when the successor is not simply the next entry.
    const next = model.entries[index - 1]; // entries are newest first
    if (!entry.yanked && next) {
      const nextKeys = [next.id, ...(next.version ? [normalize(next.version.raw)] : [])];
      if (nextKeys.includes(normalize(target)) || nextKeys.includes(target)) {
        out.push({
          rule: "relation/superseded-by-noise",
          severity: "warning",
          message:
            "`superseded-by` names the chronologically next release on an ordinary entry — every release is superseded by the one after it, so this carries no information",
          position: entry.hatch?.position ?? entry.position,
        });
      }
    }
  }

  return out;
}
