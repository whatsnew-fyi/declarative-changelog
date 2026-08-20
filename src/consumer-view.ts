import { type Level, entryLevel } from "./conformance.js";
import type { ChangelogModel, ReleaseEntry } from "./parse/document.js";

/**
 * The consumer view: what the spec's Field Mapping table says a consumer gets,
 * with nothing inferred. Absent beats guessed — omitted fields are omitted.
 */

export interface ConsumerChange {
  category: string;
  text: string;
  breaking: boolean;
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
}

export function toConsumerView(model: ChangelogModel): ConsumerView {
  const product: ConsumerView["product"] = { ...model.frontmatter.product };
  if (model.productId !== undefined) product.id = model.productId;

  const view: ConsumerView = {
    product,
    document: { ...model.frontmatter.document },
    entries: model.entries.map((entry) => toConsumerEntry(entry, model)),
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
        s.items.map((item) => ({
          category: item.category,
          text: item.text,
          breaking: item.breaking,
          markdown: item.markdown,
        })),
      ),
    prerelease: entry.prerelease,
    yanked: entry.yanked,
    routine: entry.routine,
    level: entryLevel(entry),
  };

  if (entry.version) out.version = entry.version.raw;
  if (entry.title !== undefined) out.title = entry.title;

  // url: heading link, else `url:`, else canonical + anchor, else canonical, else homepage.
  const canonical = model.frontmatter.document.canonical;
  const url =
    entry.url ?? (canonical ? `${canonical}#${entry.anchor}` : model.frontmatter.product.homepage);
  if (url !== undefined) out.url = url;

  if (entry.summary?.text) out.summary = entry.summary.text;
  if (entry.bodyMarkdown !== "") out.bodyMarkdown = entry.bodyMarkdown;
  if (entry.channel !== undefined) out.channel = entry.channel;
  if (entry.platforms !== undefined) out.platforms = entry.platforms;
  if (entry.covers !== undefined) out.covers = entry.covers;
  if (entry.supersededBy !== undefined) out.supersededBy = entry.supersededBy;
  return out;
}
