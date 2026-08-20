import type { Heading, Link } from "mdast";
import { SEPARATORS } from "../constants.js";
import { DATE_AT_END_RE, type HeadingDate, parseIsoDate } from "./date.js";
import { flattenInline } from "./inline.js";
import { parseVersion, type Version } from "./version.js";

/**
 * The release-heading grammar, parsed right to left as the spec requires:
 * match `date tags?` anchored at the end of the line, then require what
 * precedes it to be either nothing or `label-part sep`. Nothing backtracks.
 *
 *   release-heading := "## " (label-part sep)? date tags?
 */

export interface ParsedHeading {
  version?: Version;
  title?: string;
  url?: string;
  date: HeadingDate;
  /** Raw tag tokens as written; vocabulary validation happens in the rules. */
  tags: string[];
  text: string;
}

export type HeadingResult =
  | { kind: "release"; heading: ParsedHeading }
  | { kind: "skipped"; text: string; smellsLikeRelease: boolean };

export function parseReleaseHeading(node: Heading): HeadingResult {
  const children = node.children;
  const first = children[0];

  if (first?.type === "link") {
    // `## [label](url) sep date tags?` — the link carries the whole label-part.
    const link = first as Link;
    const label = flattenInline(link.children);
    const rest = flattenInline(children.slice(1));
    const text = `${label}${rest}`;
    const sep = SEPARATORS.find((s) => rest.startsWith(s));
    if (sep !== undefined) {
      const tail = parseDateAndTags(rest.slice(sep.length));
      if (tail && tail.prefix === "") {
        const heading: ParsedHeading = {
          ...labelParts(label),
          url: link.url,
          ...tail.fields,
          text,
        };
        return { kind: "release", heading };
      }
    }
    return skipped(text);
  }

  const text = flattenInline(children);
  const tail = parseDateAndTags(text);
  if (tail) {
    if (tail.prefix === "") {
      // Bare date, optionally with tags.
      return { kind: "release", heading: { ...tail.fields, text } };
    }
    const sep = SEPARATORS.find((s) => tail.prefix.endsWith(s));
    if (sep !== undefined) {
      const label = tail.prefix.slice(0, -sep.length);
      if (label !== "") {
        return { kind: "release", heading: { ...labelParts(label), ...tail.fields, text } };
      }
    }
  }
  return skipped(text);
}

interface Tail {
  prefix: string;
  fields: { date: HeadingDate; tags: string[] };
}

/** Matches `date tags?` anchored at the end; returns whatever precedes it. */
function parseDateAndTags(text: string): Tail | undefined {
  // Try the tag run first: ` (` tag (`, ` tag)* `)` at the very end. Commit to
  // it only if a date immediately precedes it — otherwise the parens belong to
  // a title and the heading must end in a bare date to parse.
  const tagMatch = / \(([^()]*)\)$/.exec(text);
  for (const candidate of tagMatch
    ? [
        { body: text.slice(0, tagMatch.index), tags: tagMatch[1]!.split(", ") },
        { body: text, tags: [] },
      ]
    : [{ body: text, tags: [] }]) {
    const dateMatch = DATE_AT_END_RE.exec(candidate.body);
    if (!dateMatch) continue;
    const date = parseIsoDate(dateMatch[1]!);
    if (!date) continue;
    return {
      prefix: candidate.body.slice(0, dateMatch.index),
      fields: { date, tags: candidate.tags },
    };
  }
  return undefined;
}

/** `label := version | version ": " title | title`, split on the first `": "`. */
function labelParts(label: string): { version?: Version; title?: string } {
  const whole = parseVersion(label);
  if (whole) return { version: whole };
  const colon = label.indexOf(": ");
  if (colon !== -1) {
    const version = parseVersion(label.slice(0, colon));
    if (version) return { version, title: label.slice(colon + 2) };
  }
  return { title: label };
}

function skipped(text: string): HeadingResult {
  const smellsLikeRelease =
    /\d{4}-\d{2}-\d{2}/.test(text) || /(^|\s)v?\d+(\.\d+)+(\s|$|[:)])/.test(text);
  return { kind: "skipped", text, smellsLikeRelease };
}
