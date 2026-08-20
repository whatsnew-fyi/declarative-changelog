import { documentLevel, entryLevel, LEVEL_NAMES, type Level } from "./conformance.js";
import { type ConsumerView, toConsumerView } from "./consumer-view.js";
import { countBySeverity, type Diagnostic } from "./diagnostics.js";
import { buildModel, type ChangelogModel } from "./parse/document.js";
import { type ArchiveIdentifiers, type RelationContext, runRules } from "./rules/index.js";

export type { Level } from "./conformance.js";
export { LEVEL_NAMES } from "./conformance.js";
export type { ConsumerChange, ConsumerEntry, ConsumerView } from "./consumer-view.js";
export type { Diagnostic, Position, Severity } from "./diagnostics.js";
export type { ChangeItem, ChangelogModel, ReleaseEntry, Section } from "./parse/document.js";
export { reduceChangeItem } from "./parse/reduction.js";
export { compareVersions, parseVersion } from "./parse/version.js";

export interface ValidateOptions {
  /** Identifiers from the `document.older` archive chain, when it was followed. */
  archive?: ArchiveIdentifiers;
}

export interface ValidationResult {
  file: string;
  diagnostics: Diagnostic[];
  counts: { error: number; warning: number; info: number };
  level: Level;
  levelName: string;
  entryCount: number;
  model: ChangelogModel;
}

/** Parses a document into the consumer view of the Field Mapping table. */
export function parseChangelog(source: string, file = "<input>"): ConsumerView {
  return toConsumerView(buildModel(source, file));
}

/** Validates a document against the v0.1 spec. */
export function validateChangelog(
  source: string,
  file = "<input>",
  options: ValidateOptions = {},
): ValidationResult {
  const model = buildModel(source, file);
  const ctx: RelationContext = {};
  if (options.archive) ctx.archive = options.archive;
  const diagnostics = [...model.diagnostics, ...runRules(model, ctx)];

  if (model.entries.length === 0) {
    diagnostics.push({
      rule: "document/no-entries",
      severity: "info",
      message: "The document contains no release entries",
    });
  }

  diagnostics.sort((a, b) => (a.position?.line ?? 0) - (b.position?.line ?? 0));

  const level = documentLevel(model, diagnostics);
  return {
    file,
    diagnostics,
    counts: countBySeverity(diagnostics),
    level,
    levelName: LEVEL_NAMES[level],
    entryCount: model.entries.length,
    model,
  };
}

/**
 * Follows the `document.older` chain, collecting entry versions and ids so
 * `superseded-by` can resolve across archive documents. Network access happens
 * only here, and only when the caller asks for it.
 */
export async function loadArchiveChain(
  firstUrl: string,
  maxDepth = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<ArchiveIdentifiers> {
  const archive: ArchiveIdentifiers = { versions: new Set(), ids: new Set(), failures: [] };
  let url: string | undefined = firstUrl;
  for (let depth = 0; url !== undefined && depth < maxDepth; depth++) {
    let body: string;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = await response.text();
    } catch (error) {
      archive.failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    const model = buildModel(body, url);
    for (const entry of model.entries) {
      if (entry.version) archive.versions.add(entry.version.raw.replace(/^v/, ""));
      archive.ids.add(entry.id);
    }
    url = model.frontmatter.document.older;
  }
  return archive;
}

export { entryLevel };
