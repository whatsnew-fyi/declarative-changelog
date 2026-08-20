import type { Link, Paragraph, RootContent } from "mdast";
import { CATEGORIES } from "../constants.js";
import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel, ReleaseEntry } from "../parse/document.js";
import { flattenInline } from "../parse/inline.js";

export function checkEntries(model: ChangelogModel): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const entry of model.entries) {
    checkSections(entry, out);
    checkSummary(entry, out);
    checkItems(entry, out);
    checkLinkOnlyBody(entry, out);
    checkHatch(entry, out);
  }
  return out;
}

function checkSections(entry: ReleaseEntry, out: Diagnostic[]): void {
  const recognized = entry.sections.filter((s) => s.category);

  for (const section of recognized) {
    const meaningful = section.nodes.filter((n) => n.type !== "list");
    const lists = section.nodes.filter((n) => n.type === "list");
    if (section.nodes.length === 0) {
      out.push({
        rule: "entry/empty-section",
        severity: "warning",
        message: `\`### ${section.name}\` is empty`,
        position: section.position,
      });
    } else if (meaningful.length > 0 || lists.length > 1) {
      out.push({
        rule: "entry/section-content",
        severity: "error",
        message: `\`### ${section.name}\` must contain a list and nothing else`,
        position: section.position,
      });
    }
  }

  const seen = new Set<string>();
  for (const section of recognized) {
    if (seen.has(section.category!)) {
      out.push({
        rule: "entry/duplicate-section",
        severity: "warning",
        message: `\`### ${section.category}\` appears more than once in this entry`,
        position: section.position,
      });
    }
    seen.add(section.category!);
  }

  const order = recognized.map((s) => CATEGORIES.indexOf(s.category!));
  for (let i = 1; i < order.length; i++) {
    if (order[i]! < order[i - 1]!) {
      out.push({
        rule: "entry/section-order",
        severity: "warning",
        message: `Sections should appear in canonical order: ${CATEGORIES.join(" · ")}`,
        position: recognized[i]!.position,
      });
      break;
    }
  }

  const unrecognized = entry.sections.filter((s) => !s.category);
  if (unrecognized.length > 0) {
    out.push({
      rule: "conformance/uncategorized-sections",
      severity: "info",
      message: `Entry organizes changes under ${unrecognized
        .map((s) => `\`### ${s.name}\``)
        .join(
          ", ",
        )} — not one of the six categories, so the entry reaches Level 1 (Structured), not Level 2 (Categorized)`,
      position: entry.position,
    });
  }
}

function checkSummary(entry: ReleaseEntry, out: Diagnostic[]): void {
  if (entry.summary && entry.summary.paragraphCount > 1) {
    out.push({
      rule: "entry/summary-paragraphs",
      severity: "warning",
      message: "The summary blockquote should be one paragraph of plain prose",
      position: entry.summary.position,
    });
  }
}

function checkItems(entry: ReleaseEntry, out: Diagnostic[]): void {
  for (const section of entry.sections) {
    for (const item of section.items) {
      if (item.text === "") {
        out.push({
          rule: item.hasImage ? "media/image-only-item" : "entry/empty-item",
          severity: "error",
          message: item.hasImage
            ? "This change item is only an image — images must not be load-bearing; an entry has to be comprehensible with every image removed"
            : "Empty change item",
          position: item.position,
        });
      }
    }
  }
}

/** "An entry's content MUST be the release notes, not a link to them." */
function checkLinkOnlyBody(entry: ReleaseEntry, out: Diagnostic[]): void {
  if (entry.sections.length > 0 || entry.summary) return;
  const content = entry.bodyNodes;
  if (content.length !== 1 || content[0]!.type !== "paragraph") return;
  const paragraph = content[0] as Paragraph;
  const nonWhitespace = paragraph.children.filter(
    (c) => !(c.type === "text" && c.value.trim() === ""),
  );
  const isLinkOnly =
    (nonWhitespace.length === 1 && nonWhitespace[0]!.type === "link") ||
    /^https?:\/\/\S+$/.test(flattenInline(paragraph.children as RootContent[]).trim());
  if (isLinkOnly) {
    const link = nonWhitespace[0]?.type === "link" ? (nonWhitespace[0] as Link).url : "";
    out.push({
      rule: "entry/link-only-body",
      severity: "error",
      message: `The entry's content is only a link${link ? ` (\`${link}\`)` : ""} — the content must be the release notes, not a pointer to them`,
      position: entry.position,
    });
  }
}

function checkHatch(entry: ReleaseEntry, out: Diagnostic[]): void {
  if (entry.hatchMisplaced) {
    out.push({
      rule: "hatch/misplaced",
      severity: "error",
      message:
        "The ```changelog escape hatch must sit immediately after the `##` heading, before the summary",
      position: entry.hatchMisplaced,
    });
  }
  if (entry.hatch?.prerelease !== undefined && entry.version) {
    out.push({
      rule: "hatch/prerelease-with-version",
      severity: "error",
      message: `\`prerelease:\` is only for versionless releases — \`${entry.version.raw}\` already says this by itself (a semver pre-release suffix is the signal)`,
      position: entry.hatch.position,
    });
  }
}
