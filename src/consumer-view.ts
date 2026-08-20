import { entryLevel, type Level } from "./conformance.js";
import type { ChangelogModel, ReleaseEntry } from "./parse/document.js";
import type { ChangeReference } from "./parse/reduction.js";

/**
 * The consumer view: what the spec's Field Mapping table says a consumer gets,
 * with nothing inferred. Absent beats guessed — omitted fields are omitted.
 */

export interface ConsumerChange {
  category: string;
  text: string;
  breaking: boolean;
  /** Detached reference-tail tokens — detached, not discarded. */
  references: ChangeReference[];
  /** The covered version this item is attributed to, `v` stripped. */
  attributedTo?: string;
  markdown: string;
}

export interface ConsumerEntry {
  id: string;
  version?: string;
  title?: string;
  date: string;
  url?: string;
  summary?: string;
  bodyMarkdown?: string;
  changes: ConsumerChange[];
  prerelease: boolean;
  channel?: string;
  platforms?: string[];
  yanked: boolean;
  routine: boolean;
  covers?: string[];
  supersededBy?: string;
  level: Level;
}

export interface ConsumerView {
  changelog?: string;
  product: ChangelogModel["frontmatter"]["product"] & { id?: string };
  document: ChangelogModel["frontmatter"]["document"];
  entries: ConsumerEntry[];
  /**
   * Headings a consumer skips, counted — "three releases" and "three
   * releases, four candidates skipped" are different statements.
   */
  skipped: { headings: number; candidates: number };
}

export function toConsumerView(model: ChangelogModel): ConsumerView {
  const product: ConsumerView["product"] = { ...model.frontmatter.product };
  if (model.productId !== undefined) product.id = model.productId;

  const view: ConsumerView = {
    product,
    document: { ...model.frontmatter.document },
    entries: model.entries.map((entry) => toConsumerEntry(entry, model)),
    skipped: {
      headings: model.skipped.length,
      candidates: model.skipped.filter((s) => s.candidate).length,
    },
  };
  if (model.frontmatter.changelog !== undefined) view.changelog = model.frontmatter.changelog;
  return view;
}

function toConsumerEntry(entry: ReleaseEntry, model: ChangelogModel): ConsumerEntry {
  const out: ConsumerEntry = {
    id: entry.id,
    date: entry.date.raw,
    changes: entry.sections
      .filter((s) => s.category)
      .flatMap((s) =>
        s.items.map((item) => {
          const change: ConsumerChange = {
            category: item.category,
            text: item.text,
            breaking: item.breaking,
            references: item.references,
            markdown: item.markdown,
          };
          if (item.attribution !== undefined) {
            change.attributedTo = item.attribution.replace(/^v/, "");
          }
          return change;
        }),
      ),
    prerelease: entry.prerelease,
    yanked: entry.yanked,
    routine: entry.routine,
    level: entryLevel(entry),
  };

  if (entry.version) out.version = entry.version.raw.replace(/^v/, "");
  if (entry.title !== undefined) out.title = entry.title;

  // url: `url:`, else the heading link, else canonical, else homepage — never
  // a fabricated fragment.
  const url =
    entry.url ?? model.frontmatter.document.canonical ?? model.frontmatter.product.homepage;
  if (url !== undefined) out.url = url;

  if (entry.summary?.text) out.summary = entry.summary.text;
  if (entry.bodyMarkdown !== "") out.bodyMarkdown = entry.bodyMarkdown;
  if (entry.channel !== undefined) out.channel = entry.channel;
  if (entry.platforms !== undefined) out.platforms = entry.platforms;
  if (entry.covers !== undefined) out.covers = entry.covers;
  if (entry.supersededBy !== undefined) out.supersededBy = entry.supersededBy;
  return out;
}
