import type { Node, Paragraph, Parent, PhrasingContent } from "mdast";

/**
 * The change-item text reduction (spec §Change item text):
 *
 *   1. take the item's first paragraph;
 *   2. strip the reference tail — a trailing run of parenthesized link groups,
 *      bare issue references (#1204, GH-1204, KES-88) and credits (@handle,
 *      thanks to @handle), with the whitespace and commas joining them;
 *   3. flatten inline markup.
 */

export interface ReducedChange {
  text: string;
  breaking: boolean;
}

interface Flattened {
  text: string;
  /** Character spans of `text` that came from link nodes. */
  linkSpans: Array<[number, number]>;
}

// A bare @handle can be ordinary prose ("Reported by @finch"), so a credit is
// only tail when thanks-prefixed or comma-joined. Issue refs may be space-joined.
const BARE_CREDIT_RE = /(?:[\s,]+thanks\s+(?:to\s+)?@[\w-]+|,\s*@[\w-]+)\.?$/;
const BARE_ISSUE_RE = /[\s,]+(?:#\d+|GH-\d+|[A-Z][A-Z0-9]*-\d+)\.?$/;
const TAIL_TOKEN_RE = /^(?:@[\w-]+|#\d+|GH-\d+|[A-Z][A-Z0-9]*-\d+|thanks|to)$/;
const BREAKING_SEP_RE = /^\s*(?:—|–|-|:)?\s*/;

export function reduceChangeItem(paragraph: Paragraph): ReducedChange {
  let children: PhrasingContent[] = paragraph.children;
  let breaking = false;

  const first = children[0];
  if (first?.type === "strong" && flatten([first]).text.trim().toLowerCase() === "breaking") {
    breaking = true;
    children = children.slice(1);
    const next = children[0];
    if (next?.type === "text") {
      children = [
        { ...next, value: next.value.replace(BREAKING_SEP_RE, "") },
        ...children.slice(1),
      ];
    }
  }

  const { text, linkSpans } = flatten(children);
  return { text: stripReferenceTail(collapse(text), linkSpans), breaking };
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function flatten(nodes: readonly Node[]): Flattened {
  let text = "";
  const linkSpans: Array<[number, number]> = [];
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
          linkSpans.push([start, text.length]);
          break;
        }
        default:
          if (Array.isArray((node as Parent).children)) walk((node as Parent).children);
          break;
      }
    }
  };
  walk(nodes);
  return { text, linkSpans };
}

function stripReferenceTail(input: string, linkSpans: Array<[number, number]>): string {
  let s = input;
  for (;;) {
    const trimmed = s.replace(/[\s,]+$/, "");
    s = trimmed;

    const bare = BARE_CREDIT_RE.exec(s) ?? BARE_ISSUE_RE.exec(s);
    if (bare && bare.index > 0) {
      s = s.slice(0, bare.index);
      continue;
    }

    if (s.endsWith(")")) {
      const open = matchingParen(s);
      if (open > 0 && isTailGroup(s.slice(open + 1, s.length - 1), open + 1, linkSpans)) {
        s = s.slice(0, open);
        continue;
      }
    }
    break;
  }
  return s.replace(/[\s,]+$/, "");
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
 * A parenthesized group is part of the reference tail when everything in it is
 * link text, a reference token, a credit, or joining punctuation.
 */
function isTailGroup(
  content: string,
  contentStart: number,
  linkSpans: Array<[number, number]>,
): boolean {
  if (content.trim() === "") return false;
  // Blank out characters that came from links, then require every remaining
  // token to be a reference or credit word.
  const chars = content.split("");
  for (const [start, end] of linkSpans) {
    for (
      let i = Math.max(start, contentStart);
      i < Math.min(end, contentStart + content.length);
      i++
    ) {
      chars[i - contentStart] = " ";
    }
  }
  const rest = chars.join("");
  return rest
    .split(/[\s,]+/)
    .filter((token) => token !== "" && token !== ".")
    .every((token) => TAIL_TOKEN_RE.test(token));
}
