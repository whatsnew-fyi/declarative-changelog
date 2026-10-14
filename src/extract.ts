import { buildModel } from "./parse/document.js";

/**
 * `extract` — one entry's notes as markdown, for the places a release is
 * written down a second time: a GitHub release body, goreleaser's
 * `--release-notes`, a store listing. The changelog stays the one source.
 *
 * The body is the entry as written, minus its heading, its escape hatch (that
 * is metadata for machines, not notes for people) and any link definitions
 * the file keeps at its foot.
 */

export interface Extracted {
  /** The release heading's text, without `## `. */
  heading: string;
  version?: string;
  markdown: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DEFINITION = /^\[[^\]]+\]:\s*\S/;

/** `latest` is the first entry that is not yanked; a version matches with or without its `v`. */
export function extractEntry(source: string, which: string): Extracted | undefined {
  const model = buildModel(source, "<extract>");
  const bare = (value: string) => value.replace(/^v/, "");
  const entry =
    which === "latest"
      ? model.entries.find((candidate) => !candidate.yanked)
      : model.entries.find(
          (candidate) => candidate.version && bare(candidate.version.raw) === bare(which),
        );
  if (!entry) return undefined;

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const start = entry.position.line; // the line after the heading, 0-indexed
  let end = lines.length;
  let open: string | undefined;
  for (let i = start; i < lines.length; i++) {
    const marker = FENCE.exec(lines[i]!)?.[1];
    if (open) {
      if (marker && marker[0] === open[0] && marker.length >= open.length) open = undefined;
      continue;
    }
    if (marker) {
      open = marker;
      continue;
    }
    if (/^#{1,2} /.test(lines[i]!)) {
      end = i;
      break;
    }
  }

  let body = lines.slice(start, end);
  // The foot of the file: blank lines and link definitions.
  while (body.length && (body.at(-1)!.trim() === "" || DEFINITION.test(body.at(-1)!))) body.pop();
  while (body.length && body[0]!.trim() === "") body.shift();
  // The escape hatch, when it opens the entry.
  if (body[0] && /^ {0,3}(`{3,}|~{3,})changelog\s*$/.test(body[0])) {
    const fence = FENCE.exec(body[0])![1]!;
    const close = body.findIndex(
      (line, i) => i > 0 && FENCE.exec(line)?.[1]?.startsWith(fence[0]!.repeat(fence.length)),
    );
    body = close > 0 ? body.slice(close + 1) : body;
    while (body.length && body[0]!.trim() === "") body.shift();
  }

  const result: Extracted = {
    heading: lines[entry.position.line - 1]!.replace(/^##\s+/, ""),
    markdown: body.join("\n"),
  };
  if (entry.version) result.version = entry.version.raw;
  return result;
}
