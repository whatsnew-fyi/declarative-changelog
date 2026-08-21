import type {
  Blockquote,
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
} from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { CATEGORIES, type Category, type Tag } from "../constants.js";
import { type Diagnostic, LineIndex, type Position } from "../diagnostics.js";
import type { HeadingDate } from "./date.js";
import { parseIsoDate } from "./date.js";
import { type EscapeHatch, parseEscapeHatch } from "./escape-hatch.js";
import { type Frontmatter, parseFrontmatter, slugProductName } from "./frontmatter.js";
import { type ParsedHeading, parseReleaseHeading } from "./heading.js";
import { flattenInline } from "./inline.js";
import { type ReducedChange, reduceChangeItem } from "./reduction.js";
import { parseVersion, type Version } from "./version.js";

export interface ChangeItem extends ReducedChange {
  category: Category;
  markdown: string;
  position: Position;
  hasImage: boolean;
}

export interface Section {
  /** Heading text as written. */
  name: string;
  /** Set when `name` is one of the six categories (case-insensitive). */
  category?: Category;
  position: Position;
  /** Content nodes between this `###` and the next heading. */
  nodes: RootContent[];
  items: ChangeItem[];
}

export interface ReleaseEntry {
  headingText: string;
  position: Position;
  version?: Version;
  title?: string;
  date: HeadingDate;
  url?: string;
  /** Raw tag tokens from the heading, unvalidated. */
  tags: string[];
  hatch?: EscapeHatch;
  /** Set when a ```changelog fence was not the first thing after the heading. */
  hatchMisplaced?: Position;
  summary?: { text: string; paragraphCount: number; position: Position };
  sections: Section[];
  /** Entry content outside recognized sections, hatch and summary excluded. */
  bodyNodes: RootContent[];
  bodyMarkdown: string;
  /** All content nodes of the entry, for media/HTML scans. */
  allNodes: RootContent[];

  // Effective values, escape hatch applied over the heading.
  yanked: boolean;
  routine: boolean;
  channel?: string;
  platforms?: string[];
  covers?: string[];
  supersededBy?: string;
  prerelease: boolean;
  id: string;
}

export interface SkippedHeading {
  text: string;
  /** Contains a date, so it was almost certainly meant to be a release. */
  candidate: boolean;
  /** The diagnosed character-level reason a candidate failed to parse. */
  nearMiss?: string;
  position: Position;
}

export interface ChangelogModel {
  file: string;
  source: string;
  lines: LineIndex;
  hasFrontmatter: boolean;
  frontmatter: Frontmatter;
  productId: string | undefined;
  title?: { text: string; position: Position };
  entries: ReleaseEntry[];
  skipped: SkippedHeading[];
  /** Diagnostics emitted while building the model. */
  diagnostics: Diagnostic[];
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);

export function buildModel(source: string, file: string): ChangelogModel {
  const root = processor.parse(source) as Root;
  const lines = new LineIndex(source);
  const diagnostics: Diagnostic[] = [];

  const model: ChangelogModel = {
    file,
    source,
    lines,
    hasFrontmatter: false,
    frontmatter: { product: {}, document: {}, valid: false },
    productId: undefined,
    entries: [],
    skipped: [],
    diagnostics,
  };

  const children = root.children;
  let index = 0;

  const fmNode = children[0];
  if (fmNode?.type === "yaml") {
    model.hasFrontmatter = true;
    const baseOffset = (fmNode.position?.start.offset ?? 0) + 4; // past "---\n"
    model.frontmatter = parseFrontmatter(fmNode.value, baseOffset, lines, diagnostics);
    index = 1;
  } else {
    diagnostics.push({
      rule: "frontmatter/missing",
      severity: "error",
      message: 'The document has no YAML frontmatter — `changelog: "0.1"` is required',
      position: { line: 1, column: 1 },
    });
  }
  model.productId =
    model.frontmatter.product.id ??
    (model.frontmatter.product.name ? slugProductName(model.frontmatter.product.name) : undefined);

  // Split the document at depth-2 headings.
  let current: { heading: Heading; parsed: ParsedHeading; nodes: RootContent[] } | undefined;
  const flushEntry = () => {
    if (current)
      model.entries.push(buildEntry(current.parsed, current.heading, current.nodes, model));
    current = undefined;
  };

  for (; index < children.length; index++) {
    const node = children[index]!;
    if (node.type === "heading" && node.depth === 1) {
      if (current) {
        current.nodes.push(node);
        continue;
      }
      if (model.title) {
        diagnostics.push({
          rule: "document/multiple-titles",
          severity: "warning",
          message: "More than one `# ` title — a changelog has one document title",
          position: pos(node),
        });
      } else {
        model.title = { text: flattenInline(node.children), position: pos(node) };
      }
      continue;
    }
    if (node.type === "heading" && node.depth === 2) {
      flushEntry();
      const result = parseReleaseHeading(node);
      if (result.kind === "release") {
        current = { heading: node, parsed: result.heading, nodes: [] };
      } else {
        const skipped: SkippedHeading = {
          text: result.text,
          candidate: result.candidate,
          position: pos(node),
        };
        if (result.nearMiss !== undefined) skipped.nearMiss = result.nearMiss;
        model.skipped.push(skipped);
      }
      continue;
    }
    if (current) current.nodes.push(node);
  }
  flushEntry();

  if (!model.title && model.hasFrontmatter) {
    diagnostics.push({
      rule: "document/title-missing",
      severity: "warning",
      message: "The document has no `# ` title",
      position: { line: 1, column: 1 },
    });
  }

  return model;
}

function buildEntry(
  parsed: ParsedHeading,
  headingNode: Heading,
  nodes: RootContent[],
  model: ChangelogModel,
): ReleaseEntry {
  const { source, lines, diagnostics } = model;
  const position = pos(headingNode);

  let hatch: EscapeHatch | undefined;
  let hatchMisplaced: Position | undefined;
  let summary: ReleaseEntry["summary"];
  const sections: Section[] = [];
  const bodyNodes: RootContent[] = [];

  let currentSection: Section | undefined;
  let sawContent = false;

  for (const node of nodes) {
    if (node.type === "code" && (node as Code).lang === "changelog") {
      const code = node as Code;
      if (hatch) {
        diagnostics.push({
          rule: "hatch/duplicate",
          severity: "error",
          message: "An entry has at most one ```changelog escape hatch",
          position: pos(code),
        });
        continue;
      }
      const startOffset = code.position?.start.offset ?? 0;
      const contentOffset = source.indexOf("\n", startOffset) + 1;
      hatch = parseEscapeHatch(code.value, contentOffset, pos(code), lines, diagnostics);
      if (sawContent || currentSection) hatchMisplaced = pos(code);
      continue;
    }

    if (node.type === "heading" && node.depth === 3) {
      currentSection = undefined;
      const name = flattenInline((node as Heading).children);
      const category = CATEGORIES.find((c) => c.toLowerCase() === name.trim().toLowerCase());
      const section: Section = { name, position: pos(node), nodes: [], items: [] };
      if (category) section.category = category;
      sections.push(section);
      currentSection = section;
      if (!category) bodyNodes.push(node);
      sawContent = true;
      continue;
    }

    if (currentSection) {
      currentSection.nodes.push(node);
      if (!currentSection.category) bodyNodes.push(node);
      sawContent = true;
      continue;
    }

    // The summary is the blockquote *directly after* the heading or its hatch
    // — position, not order. A blockquote anywhere else, and any blockquote
    // opening with `[!` (a GitHub alert callout), is body.
    if (node.type === "blockquote" && !sawContent && !summary) {
      const paragraphs = (node as Blockquote).children.filter((c) => c.type === "paragraph");
      const text = paragraphs[0]
        ? collapse(flattenInline((paragraphs[0] as Paragraph).children))
        : "";
      if (!text.startsWith("[!")) {
        summary = { text, paragraphCount: paragraphs.length, position: pos(node) };
        sawContent = true;
        continue;
      }
    }

    bodyNodes.push(node);
    sawContent = true;
  }

  // Change items from recognized sections.
  for (const section of sections) {
    if (!section.category) continue;
    for (const child of section.nodes) {
      if (child.type !== "list") continue;
      for (const item of (child as List).children as ListItem[]) {
        const firstParagraph = item.children.find((c) => c.type === "paragraph") as
          | Paragraph
          | undefined;
        const reduced: ReducedChange = firstParagraph
          ? reduceChangeItem(firstParagraph)
          : { text: "", breaking: false, references: [] };
        section.items.push({
          ...reduced,
          category: section.category,
          markdown: slice(source, item),
          position: pos(item),
          hasImage: containsType(item, "image"),
        });
      }
    }
  }

  // Effective values: where a key and the heading state the same fact, the
  // hatch wins — one precedence rule, no exceptions. Winning is not license
  // to disagree: contradicting a heading that parses cleanly draws a warning.
  const version = hatch?.version ? parseVersion(hatch.version) : parsed.version;
  const title = hatch?.title ?? parsed.title;
  const date = hatch?.date ? (parseIsoDate(hatch.date) ?? parsed.date) : parsed.date;
  const url = hatch?.url ?? parsed.url;

  if (hatch) {
    const contradictions: string[] = [];
    if (hatch.version !== undefined && parsed.version !== undefined) {
      if (normalizeVersion(hatch.version) !== normalizeVersion(parsed.version.raw)) {
        contradictions.push(`version \`${hatch.version}\` vs \`${parsed.version.raw}\``);
      }
    }
    if (hatch.title !== undefined && parsed.title !== undefined && hatch.title !== parsed.title) {
      contradictions.push(`title \`${hatch.title}\` vs \`${parsed.title}\``);
    }
    if (
      hatch.date !== undefined &&
      parsed.date.valid &&
      hatch.date.slice(0, 10) !== parsed.date.raw.slice(0, 10)
    ) {
      contradictions.push(`date \`${hatch.date}\` vs \`${parsed.date.raw}\``);
    }
    for (const contradiction of contradictions) {
      diagnostics.push({
        rule: "hatch/contradicts-heading",
        severity: "warning",
        message: `The escape hatch contradicts a heading that parses cleanly (${contradiction}) — a document whose human and machine readings diverge has reintroduced the disease this format treats`,
        position: hatch.position,
      });
    }
  }

  const tags = parsed.tags;
  const yanked = tags.includes("yanked" satisfies Tag);
  const routine = tags.includes("routine" satisfies Tag);
  // The entry's platform set, where it differs from the product's — the
  // heading run carries lifecycle only.
  const platforms = hatch?.platforms ?? model.frontmatter.product.platforms;

  // `v2.4.1` and `2.4.1` are the same version and the same identifier; the
  // date portion only, even when the heading carries a time.
  const versionKey = version ? normalizeVersion(version.raw) : undefined;
  const key = versionKey ?? date.raw.slice(0, 10);
  const id = hatch?.id ?? (model.productId ? `${model.productId}@${key}` : key);

  const entry: ReleaseEntry = {
    headingText: parsed.text,
    position,
    date,
    tags,
    summary,
    sections,
    bodyNodes,
    bodyMarkdown: bodyNodes.map((n) => slice(source, n)).join("\n\n"),
    allNodes: nodes,
    yanked,
    routine,
    prerelease: version?.prerelease !== undefined || (!version && hatch?.prerelease === true),
    id,
  };
  if (version) entry.version = version;
  if (title !== undefined) entry.title = title;
  if (url !== undefined) entry.url = url;
  if (hatch) entry.hatch = hatch;
  if (hatchMisplaced) entry.hatchMisplaced = hatchMisplaced;
  if (hatch?.channel !== undefined) entry.channel = hatch.channel;
  if (platforms !== undefined) entry.platforms = platforms;
  if (hatch?.covers !== undefined) entry.covers = hatch.covers;
  if (hatch?.supersededBy !== undefined) entry.supersededBy = hatch.supersededBy;
  return entry;
}

export function pos(node: {
  position?:
    | { start: { line: number; column: number }; end: { line: number; column: number } }
    | undefined;
}): Position {
  return {
    line: node.position?.start.line ?? 1,
    column: node.position?.start.column ?? 1,
    endLine: node.position?.end.line ?? 1,
    endColumn: node.position?.end.column ?? 1,
  };
}

function slice(source: string, node: RootContent): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : source.slice(start, end);
}

export function containsType(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  if ((node as { type?: string }).type === type) return true;
  const children = (node as { children?: unknown[] }).children;
  return Array.isArray(children) && children.some((c) => containsType(c, type));
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeVersion(raw: string): string {
  return raw.replace(/^v/, "");
}
