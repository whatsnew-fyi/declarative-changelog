import { CATEGORIES, type Category, UNRELEASED_RE } from "./constants.js";
import { parseIsoDate } from "./parse/date.js";
import { buildModel } from "./parse/document.js";
import { parseVersion } from "./parse/version.js";

/**
 * `normalize` — repairs what release tools write into a declarative changelog,
 * so a project can keep its tool and still publish a conforming file:
 *
 * - **release-please** writes `## [1.3.0](compare) (2026-10-14)`, a heading the
 *   grammar rejects, and files breaking changes under `### ⚠ BREAKING CHANGES`.
 *   When nothing in the file matches its insertion pattern it also writes the
 *   entry above the frontmatter, and when `## [Unreleased]` is the first match
 *   it writes the entry above that, so Unreleased drifts down the file.
 * - **changesets** writes `## 1.3.0` with no date, which every consumer skips,
 *   and files changes under `### Major/Minor/Patch Changes`. Version 2 inserts
 *   the entry after the file's first line, which is inside the frontmatter.
 *
 * Text in, text out, line by line: bytes outside the entries it touches are
 * left as they were. By default only the **new** entries are touched, which
 * means the headings above the newest one that already conforms. `all`
 * extends the heading and section repairs to every entry, for the first run on
 * an existing file, but never stamps a date on an old entry.
 */

export interface NormalizeOptions {
  /** RFC 3339 date or date-time for new undated entries. Default: now, UTC, to the second. */
  date?: string;
  /** Repair every entry, not only the new ones. Dates are still only stamped on new ones. */
  all?: boolean;
  /** Keep changesets' Major/Minor/Patch sections rather than mapping them to categories. */
  keepSections?: boolean;
}

export interface NormalizeResult {
  output: string;
  /** What changed, one line each; empty when the document was already normal. */
  changes: string[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const YAML_KEY = /^[A-Za-z_][\w-]*:(\s|$)/;
const ITEM = /^[*+-]\s+/;
const DEFINITION = /^\[[^\]]+\]:\s*\S/;
const BREAKING_MARKER = "**Breaking** — ";

/** Section names release tools write, read as the category they mean. */
const SECTION_ALIASES: Record<string, Category> = {
  features: "Added",
  "bug fixes": "Fixed",
  "performance improvements": "Changed",
  reverts: "Changed",
  "minor changes": "Added",
  "patch changes": "Fixed",
};

/** Sections whose items are breaking, and the category they move to without a twin. */
const BREAKING_SECTIONS = /^(?:⚠️?\s*)?breaking changes?!?$/i;
const MAJOR_SECTION = /^major changes$/i;

/** Which lines sit inside (or on) a fenced code block. */
function fenced(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let open: string | undefined;
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1];
    if (open) {
      mask.push(true);
      if (marker && marker[0] === open[0] && marker.length >= open.length) open = undefined;
    } else if (marker) {
      mask.push(true);
      open = marker;
    } else {
      mask.push(false);
    }
  }
  return mask;
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === "") start++;
  while (end > start && lines[end - 1]!.trim() === "") end--;
  return lines.slice(start, end);
}

/** The closing `---` of a block opened at `open`. */
function closeOf(lines: readonly string[], open: number): number | undefined {
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i] === "---") return i;
  }
  return undefined;
}

/** A label release tools write: a version, `[version]`, or `[version](url)`. */
function versionLabel(label: string): boolean {
  const linked = /^\[([^\]]+)\](?:\([^)\s]*\))?$/.exec(label);
  return parseVersion(linked ? linked[1]! : label) !== undefined;
}

function nowStamp(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

interface Section {
  name: string;
  intro: string[];
  items: string[][];
}

/** An entry body split into what precedes the first `###` and its sections. */
function sectionsOf(body: readonly string[]): { preamble: string[]; sections: Section[] } {
  const mask = fenced(body);
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | undefined;
  body.forEach((line, i) => {
    if (!mask[i] && /^### /.test(line)) {
      current = { name: line.slice(4).trim(), intro: [], items: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      preamble.push(line);
      return;
    }
    if (!mask[i] && ITEM.test(line)) {
      current.items.push([line]);
      return;
    }
    const last = current.items.at(-1);
    if (last) last.push(line);
    else current.intro.push(line);
  });
  for (const section of sections) {
    section.intro = trimBlank(section.intro);
    section.items = section.items.map(trimBlank);
  }
  return { preamble, sections };
}

/** `* **api:** drop v1 ([abc1234](…))` and `* **api:** drop v1` are one change. */
function itemKey(item: readonly string[]): string {
  return (item[0] ?? "")
    .replace(ITEM, "")
    .replace(/^\*\*Breaking\*\*\s*[—–-]\s*/, "")
    .replace(/(\s*\((?:\[[^\]]*\]\([^)]*\)|#\d+)(?:,\s*(?:\[[^\]]*\]\([^)]*\)|#\d+))*\))+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The item with `- ` as its bullet and, when asked, the Breaking marker. */
function asItem(item: readonly string[], breaking: boolean): string[] {
  const [first = "", ...rest] = item;
  let text = first.replace(ITEM, "");
  if (breaking && !text.startsWith("**Breaking**")) text = `${BREAKING_MARKER}${text}`;
  return [`- ${text}`, ...rest];
}

function canonicalName(name: string, keepSections: boolean): Category | undefined {
  const lower = name.toLowerCase();
  const direct = CATEGORIES.find((category) => category.toLowerCase() === lower);
  if (direct) return direct;
  if (keepSections && /^(major|minor|patch) changes$/.test(lower)) return undefined;
  return SECTION_ALIASES[lower];
}

/**
 * One entry's sections, repaired: tool section names read as categories,
 * breaking items marked in the category their twin sits in (or moved to
 * Changed), categories merged and in canonical order, everything else after
 * them as it was. Returns undefined when nothing changed.
 */
function repairSections(
  body: readonly string[],
  options: NormalizeOptions,
  changes: string[],
  heading: string,
  /** Lay the sections out even when nothing in them needs repair: the heading was rewritten. */
  relayout: boolean,
): string[] | undefined {
  const { preamble, sections } = sectionsOf(body);
  if (sections.length === 0) return undefined;

  const local: string[] = [];
  const byCategory = new Map<Category, { intro: string[]; items: string[][] }>();
  const others: Section[] = [];
  const breaking: string[][] = [];
  const slot = (category: Category) => {
    let entry = byCategory.get(category);
    if (!entry) {
      entry = { intro: [], items: [] };
      byCategory.set(category, entry);
    }
    return entry;
  };

  for (const section of sections) {
    if (BREAKING_SECTIONS.test(section.name)) {
      breaking.push(...section.items);
      local.push(
        `moved ${section.items.length} from \`### ${section.name}\` to the Breaking marker`,
      );
      continue;
    }
    if (!options.keepSections && MAJOR_SECTION.test(section.name)) {
      const target = slot("Changed");
      target.items.push(...section.items.map((item) => asItem(item, true)));
      target.intro.push(...section.intro);
      local.push(`filed \`### ${section.name}\` under Changed with the Breaking marker`);
      continue;
    }
    const category = canonicalName(section.name, options.keepSections ?? false);
    if (!category) {
      others.push(section);
      continue;
    }
    if (category !== section.name)
      local.push(`renamed \`### ${section.name}\` to \`### ${category}\``);
    const target = slot(category);
    target.intro.push(...section.intro);
    target.items.push(...section.items.map((item) => asItem(item, false)));
  }

  // A breaking item marks its twin where the change belongs; without one it
  // is a change in behaviour, filed under Changed.
  for (const item of breaking) {
    const key = itemKey(item);
    let marked = false;
    for (const entry of byCategory.values()) {
      const index = entry.items.findIndex((candidate) => itemKey(candidate) === key);
      if (index >= 0) {
        entry.items[index] = asItem(entry.items[index]!, true);
        marked = true;
        break;
      }
    }
    if (!marked) slot("Changed").items.unshift(asItem(item, true));
  }

  const ordered = CATEGORIES.filter((category) => byCategory.has(category));
  const seen = sections
    .map((section) => canonicalName(section.name, options.keepSections ?? false))
    .filter((category): category is Category => category !== undefined);
  const merged = seen.length !== new Set(seen).size;
  const outOfOrder = seen.some(
    (category, i) => i > 0 && CATEGORIES.indexOf(category) < CATEGORIES.indexOf(seen[i - 1]!),
  );
  if (merged) local.push("merged repeated sections");
  if (outOfOrder) local.push("sorted sections into canonical order");
  if (local.length === 0 && !relayout) return undefined;
  if (local.length) changes.push(`${heading}: ${local.join("; ")}`);

  const out = [...trimBlank(preamble)];
  if (out.length) out.push("");
  for (const category of ordered) {
    const entry = byCategory.get(category)!;
    out.push(`### ${category}`, "");
    if (entry.intro.length) out.push(...entry.intro, "");
    for (const item of entry.items) out.push(...item);
    out.push("");
  }
  for (const section of others) {
    out.push(`### ${section.name}`, "");
    if (section.intro.length) out.push(...section.intro, "");
    for (const item of section.items) out.push(...item);
    out.push("");
  }
  return out;
}

/** Moves a frontmatter block that a tool pushed down, or pushed an entry into, back to the top. */
function repairFrontmatter(lines: string[], changes: string[]): string[] {
  if (lines[0] === "---") {
    const close = closeOf(lines, 0);
    if (close === undefined) return lines;
    let first = 1;
    while (first < close && lines[first]!.trim() === "") first++;
    // changesets v2 replaces the file's first newline with the entry.
    if (first < close && /^## \[?v?\d/.test(lines[first]!)) {
      let yaml = first;
      while (yaml < close && !YAML_KEY.test(lines[yaml]!)) yaml++;
      if (yaml === close) return lines;
      const entry = trimBlank(lines.slice(1, yaml));
      const rest = [lines[0]!, ...lines.slice(yaml)];
      changes.push(`moved \`${entry[0]}\` out of the frontmatter`);
      return insertEntry(rest, entry);
    }
    return lines;
  }
  for (let open = 1; open < lines.length; open++) {
    if (lines[open] !== "---") continue;
    const close = closeOf(lines, open);
    if (close === undefined) break;
    const block = lines.slice(open, close + 1);
    if (!block.some((line) => /^changelog\s*:/.test(line))) continue;
    changes.push("moved the frontmatter back to the top");
    return [...block, "", ...trimBlank([...lines.slice(0, open), ...lines.slice(close + 1)])];
  }
  return lines;
}

/**
 * Moves `## [Unreleased]` back above the entries a tool wrote over it. A tool
 * that inserts above the first `## [` heading puts each release above
 * Unreleased; Keep a Changelog keeps Unreleased on top.
 */
function hoistUnreleased(lines: string[], changes: string[]): string[] {
  const model = buildModel(`${lines.join("\n")}\n`, "<normalize>");
  const conforming = new Set(model.entries.map((entry) => entry.position.line - 1));
  const start = lines[0] === "---" ? (closeOf(lines, 0) ?? 0) + 1 : 0;
  const mask = fenced(lines);
  const headings: number[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!mask[i] && /^#{1,2} /.test(lines[i]!)) headings.push(i);
  }
  const releases = headings.filter((i) => lines[i]!.startsWith("## "));
  const unreleased = releases.find((i) => UNRELEASED_RE.test(lines[i]!.slice(3).trim()));
  if (unreleased === undefined) return lines;
  // The first entry above it that a tool just wrote, i.e. one that does not conform yet.
  const firstNew = releases.find((i) => i < unreleased && !conforming.has(i));
  if (firstNew === undefined) return lines;

  const next = headings.find((i) => i > unreleased) ?? lines.length;
  let end = next;
  if (next === lines.length) {
    // A trailing run of link definitions belongs to the file.
    while (
      end > unreleased + 1 &&
      (lines[end - 1]!.trim() === "" || DEFINITION.test(lines[end - 1]!))
    )
      end--;
  }
  const block = trimBlank(lines.slice(unreleased, end));
  const before = trimBlank(lines.slice(firstNew, unreleased));
  const after = trimBlankStart(lines.slice(end));
  changes.push(`moved \`${lines[unreleased]}\` back above the new entries`);
  return [
    ...lines.slice(0, firstNew),
    ...block,
    "",
    ...before,
    ...(after.length ? ["", ...after] : []),
  ];
}

function trimBlankStart(lines: string[]): string[] {
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === "") start++;
  return lines.slice(start);
}

/** Puts an entry above the first `## ` heading after the frontmatter, or at the end. */
function insertEntry(lines: string[], entry: string[]): string[] {
  const close = closeOf(lines, 0) ?? -1;
  const mask = fenced(lines);
  for (let i = close + 1; i < lines.length; i++) {
    if (!mask[i] && /^## /.test(lines[i]!)) {
      return [...lines.slice(0, i), ...entry, "", ...lines.slice(i)];
    }
  }
  return [...trimBlank(lines), "", ...entry];
}

/** Moves `document.updated` forward to the newest date the run wrote. */
function repairUpdated(lines: string[], newest: string, changes: string[]): string[] {
  if (lines[0] !== "---") return lines;
  const close = closeOf(lines, 0);
  if (close === undefined) return lines;
  let inDocument = false;
  for (let i = 1; i < close; i++) {
    const line = lines[i]!;
    if (YAML_KEY.test(line)) inDocument = /^document\s*:/.test(line);
    const match = inDocument ? /^(\s+updated:\s*)(["']?)([^"'\s#]+)\2(.*)$/.exec(line) : null;
    if (!match) continue;
    const current = parseIsoDate(match[3]!);
    const next = parseIsoDate(newest);
    if (next && (!current || current.ms < next.ms)) {
      const out = [...lines];
      out[i] = `${match[1]}${match[2]}${newest}${match[2]}${match[4]}`;
      changes.push(`moved document.updated to ${newest}`);
      return out;
    }
    return lines;
  }
  return lines;
}

export function normalizeChangelog(
  source: string,
  options: NormalizeOptions = {},
): NormalizeResult {
  const stamp = options.date ?? nowStamp();
  const date = parseIsoDate(stamp);
  if (!date?.valid) {
    throw new Error(`--date must be an RFC 3339 date or date-time, got \`${stamp}\``);
  }
  const crlf = source.includes("\r\n");
  const finalNewline = /\n$/.test(source);
  const changes: string[] = [];

  let lines = repairFrontmatter(
    source.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n"),
    changes,
  );
  lines = hoistUnreleased(lines, changes);

  // Which headings already conform, by the validator's own reading.
  const model = buildModel(`${lines.join("\n")}\n`, "<normalize>");
  const conforming = new Set(model.entries.map((entry) => entry.position.line - 1));
  const start = lines[0] === "---" ? (closeOf(lines, 0) ?? 0) + 1 : 0;
  const mask = fenced(lines);
  const headings: number[] = [];
  for (let i = start; i < lines.length; i++) {
    if (!mask[i] && /^#{1,2} /.test(lines[i]!)) headings.push(i);
  }
  const releaseHeadings = headings.filter((i) => lines[i]!.startsWith("## "));
  const firstConforming = releaseHeadings.find((i) => conforming.has(i)) ?? lines.length;

  const dates: string[] = [];
  const out = [...lines];
  const perEntry: string[][] = [];
  // Bottom up, so splicing an entry never moves one still to be read.
  for (const index of [...releaseHeadings].reverse()) {
    const isNew = index < firstConforming;
    if (!isNew && !options.all) continue;
    const text = lines[index]!.slice(3).trim();
    if (UNRELEASED_RE.test(text)) continue;

    const local: string[] = [];
    let heading = lines[index]!;
    const parenthesized = /^(.*?\S)\s+\((\d{4}-\d{2}-\d{2})\)$/.exec(text);
    if (parenthesized && versionLabel(parenthesized[1]!)) {
      heading = `## ${parenthesized[1]} - ${parenthesized[2]}`;
      dates.push(parenthesized[2]!);
      local.push(`\`## ${text}\` → \`${heading}\``);
    } else if (isNew && versionLabel(text)) {
      heading = `## ${text} - ${stamp}`;
      dates.push(stamp);
      local.push(`\`## ${text}\` → \`${heading}\``);
    } else if (!conforming.has(index)) {
      continue;
    }
    out[index] = heading;

    // The entry runs to the next `#`/`##` heading; a trailing run of link
    // definitions belongs to the file, not to the last entry.
    const next = headings.find((i) => i > index) ?? lines.length;
    let end = next;
    if (next === lines.length) {
      let i = end;
      while (i > index + 1 && (lines[i - 1]!.trim() === "" || DEFINITION.test(lines[i - 1]!))) i--;
      if (lines.slice(i, end).some((line) => DEFINITION.test(line))) end = i;
    }
    const repaired = repairSections(
      lines.slice(index + 1, end),
      options,
      local,
      heading.slice(3),
      heading !== lines[index],
    );
    if (repaired) {
      const blank = end < lines.length && lines[end]!.trim() !== "" ? [""] : [];
      out.splice(index + 1, end - index - 1, "", ...trimBlank(repaired), ...blank);
    }
    perEntry.push(local);
  }
  changes.push(...perEntry.reverse().flat());

  lines = out;
  const newest = dates
    .map((value) => ({ value, ms: parseIsoDate(value)?.ms ?? 0 }))
    .sort((a, b) => b.ms - a.ms)[0];
  if (newest) lines = repairUpdated(lines, newest.value, changes);

  return { output: joinLines(lines, crlf, finalNewline), changes };
}

function joinLines(lines: readonly string[], crlf: boolean, finalNewline: boolean): string {
  const text = lines.join("\n") + (finalNewline ? "\n" : "");
  return crlf ? text.replace(/\n/g, "\r\n") : text;
}
