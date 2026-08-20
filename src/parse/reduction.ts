import type { Node, Paragraph, Parent, PhrasingContent } from "mdast";
import { SEPARATORS } from "../constants.js";
import { parseVersion } from "./version.js";

/**
 * The change-item reduction (spec §Change item text):
 *
 *   1. take the item's first paragraph;
 *   2. detach the reference tail — the longest trailing run of parenthesized
 *      reference groups, `#`-prefixed issue references, links whose text is a
 *      reference or credit, and credits — into structured references;
 *   3. flatten inline markup in what remains.
 *
 * Detached, not discarded: every tail token becomes a reference of kind
 * issue | cve | link | credit, with its URL when it was linked.
 */

export interface ChangeReference {
  kind: "issue" | "cve" | "link" | "credit";
  text: string;
  url?: string;
}

export interface ReducedChange {
  text: string;
  breaking: boolean;
  references: ChangeReference[];
  /** The covered version this item is attributed to (`- **2.3.1** — …`). */
  attribution?: string;
  /** A bold opener that reads like the Breaking marker but is not exact. */
  breakingNearMiss?: string;
}

interface LinkSpan {
  start: number;
  end: number;
  url: string;
}

interface Flattened {
  text: string;
  links: LinkSpan[];
}

const ISSUE_RE = /^#\d+$/;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const TRACKER_RE = /^[A-Z]+-\d+$/;
const CREDIT_RE = /^@[\w-]+$/;
// Outside a group or a link, only the `#`-prefixed form counts, and a credit
// is only tail when thanks-prefixed or comma-joined — `Reported by @finch.`
// is prose, not a tail.
const BARE_ISSUE_RE = /[\s,](#\d+)\.?$/;
const BARE_CREDIT_RE = /(?:[\s,]thanks\s+(?:to\s+)?(@[\w-]+)|,\s*(@[\w-]+))\.?$/;
const NEAR_MISS_RE = /^breaking(\s+changes?)?\s*[:!.]?$/i;

export function reduceChangeItem(paragraph: Paragraph): ReducedChange {
  let children: PhrasingContent[] = paragraph.children;
  const out: Partial<ReducedChange> = {};

  // Attribution marker first — `- **2.3.1** — …` — then the Breaking marker.
  const attribution = takeBoldMarker(children, (text) => parseVersion(text) !== undefined);
  if (attribution) {
    out.attribution = attribution.text;
    children = attribution.rest;
  }

  const first = children[0];
  if (first?.type === "strong") {
    const strongText = flatten([first]).text;
    const marker = strongText === "Breaking" ? takeBoldMarker(children, () => true) : undefined;
    if (marker) {
      out.breaking = true;
      children = marker.rest;
    } else if (NEAR_MISS_RE.test(strongText.trim())) {
      // `**BREAKING**`, `**Breaking:**`, `**Breaking change**`, or the exact
      // word without a separator — a lost signal the validator should flag.
      out.breakingNearMiss = strongText;
    }
  }

  const { text, links } = flatten(children);
  const detached = detachReferenceTail(text, links);
  return {
    text: collapse(detached.text),
    breaking: out.breaking ?? false,
    references: detached.references,
    ...(out.attribution !== undefined && { attribution: out.attribution }),
    ...(out.breakingNearMiss !== undefined && { breakingNearMiss: out.breakingNearMiss }),
  };
}

/**
 * When the first child is a bold token accepted by `test` and the text after
 * it opens with one of the three separators, consumes both and returns the
 * token and the remaining children. The separator is required: a bold version
 * or word without one is prose.
 */
function takeBoldMarker(
  children: PhrasingContent[],
  test: (text: string) => boolean,
): { text: string; rest: PhrasingContent[] } | undefined {
  const first = children[0];
  if (first?.type !== "strong") return undefined;
  const text = flatten([first]).text;
  if (!test(text)) return undefined;
  const next = children[1];
  if (next?.type !== "text") return undefined;
  const sep = SEPARATORS.find((s) => next.value.startsWith(s));
  if (sep === undefined) return undefined;
  const remainder = next.value.slice(sep.length);
  const rest =
    remainder === "" ? children.slice(2) : [{ ...next, value: remainder }, ...children.slice(2)];
  return { text, rest };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function flatten(nodes: readonly Node[]): Flattened {
  let text = "";
  const links: LinkSpan[] = [];
  const walk = (list: readonly Node[]) => {
    for (const node of list) {
      switch (node.type) {
        case "text":
        case "inlineCode":
          text += (node as unknown as { value: string }).value;
          break;
        case "image":
          text += (node as { alt?: string | null }).alt ?? "";
          break;
        case "break":
          text += " ";
          break;
        case "html":
          break;
        case "link": {
          const start = text.length;
          walk((node as Parent).children);
          links.push({ start, end: text.length, url: (node as unknown as { url: string }).url });
          break;
        }
        default:
          if (Array.isArray((node as Parent).children)) walk((node as Parent).children);
          break;
      }
    }
  };
  walk(nodes);
  return { text, links };
}

function classify(token: string): ChangeReference["kind"] | undefined {
  if (ISSUE_RE.test(token)) return "issue";
  if (CVE_RE.test(token)) return "cve";
  if (TRACKER_RE.test(token)) return "issue";
  if (CREDIT_RE.test(token)) return "credit";
  return undefined;
}

function detachReferenceTail(
  input: string,
  links: LinkSpan[],
): { text: string; references: ChangeReference[] } {
  let end = input.length;
  const references: ChangeReference[] = [];
  const trimJoiners = () => {
    while (end > 0 && /[\s,]/.test(input[end - 1]!)) end--;
  };

  for (;;) {
    trimJoiners();
    if (end === 0) break;
    const cur = input.slice(0, end);

    // A parenthesized group whose content is entirely references, links and credits.
    if (cur.endsWith(")")) {
      const open = matchingParen(cur);
      if (open > 0) {
        const groupRefs = analyzeGroup(input, open + 1, end - 1, links);
        if (groupRefs) {
          references.unshift(...groupRefs);
          end = open;
          continue;
        }
      }
    }

    // A trailing link whose text is a reference or a credit.
    const period = cur.endsWith(".") ? 1 : 0;
    const span = links.find((l) => l.end === end - period);
    if (span && span.start > 0) {
      const kind = classify(input.slice(span.start, span.end));
      if (kind) {
        references.unshift({ kind, text: input.slice(span.start, span.end), url: span.url });
        end = span.start;
        continue;
      }
    }

    // A bare `#`-prefixed issue reference. Bare tracker keys stay in the prose:
    // `HTTP-2`, `UTF-8` and `SHA-256` are tracker-key-shaped.
    const issue = BARE_ISSUE_RE.exec(cur);
    if (issue && issue.index > 0) {
      references.unshift({ kind: "issue", text: issue[1]! });
      end = issue.index;
      continue;
    }

    const credit = BARE_CREDIT_RE.exec(cur);
    if (credit && credit.index > 0) {
      references.unshift({ kind: "credit", text: (credit[1] ?? credit[2])! });
      end = credit.index;
      continue;
    }

    break;
  }

  trimJoiners();
  return { text: input.slice(0, end).replace(/[\s,]+$/, ""), references };
}

/** Index of the `(` matching a trailing `)`, or -1. */
function matchingParen(s: string): number {
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Reads a parenthesized group as tail when everything in it is a reference, a
 * link, or a credit. Returns the group's references in document order, or
 * undefined when the parens are prose.
 */
function analyzeGroup(
  input: string,
  contentStart: number,
  contentEnd: number,
  links: LinkSpan[],
): ChangeReference[] | undefined {
  const content = input.slice(contentStart, contentEnd);
  if (content.trim() === "") return undefined;

  const inner = links.filter((l) => l.start >= contentStart && l.end <= contentEnd);
  const chars = content.split("");
  for (const span of inner) {
    for (let i = span.start; i < span.end; i++) chars[i - contentStart] = " ";
  }
  const rest = chars.join("");

  const positioned: Array<{ at: number; ref: ChangeReference }> = [];
  for (const m of rest.matchAll(/[^\s,]+/g)) {
    const token = m[0].replace(/\.$/, "");
    if (token === "" || token === "." || /^thanks$/i.test(token) || /^to$/i.test(token)) continue;
    const kind = classify(token);
    if (!kind) return undefined; // prose parens, not a tail group
    positioned.push({ at: contentStart + m.index, ref: { kind, text: token } });
  }
  for (const span of inner) {
    const text = input.slice(span.start, span.end);
    positioned.push({
      at: span.start,
      ref: { kind: classify(text) ?? "link", text, url: span.url },
    });
  }

  positioned.sort((a, b) => a.at - b.at);
  return positioned.map((p) => p.ref);
}
