import {
  type Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  type Pair,
  parseAllDocuments,
  visit,
  type Node as YamlNode,
} from "yaml";
import type { Diagnostic, LineIndex, Position, Severity } from "../diagnostics.js";

/** Bridges yaml's character ranges (relative to the YAML text) to file positions. */
export class YamlContext {
  constructor(
    private readonly baseOffset: number,
    private readonly lines: LineIndex,
    readonly diagnostics: Diagnostic[],
    private readonly rulePrefix: string,
  ) {}

  pos(node: unknown): Position | undefined {
    const range = (node as { range?: [number, number, number] })?.range;
    if (!range) return undefined;
    const start = this.lines.at(this.baseOffset + range[0]);
    const end = this.lines.at(this.baseOffset + range[1]);
    return { line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
  }

  report(rule: string, severity: Severity, message: string, node?: unknown): void {
    const d: Diagnostic = { rule: `${this.rulePrefix}/${rule}`, severity, message };
    const position = node === undefined ? undefined : this.pos(node);
    if (position) d.position = position;
    this.diagnostics.push(d);
  }

  yamlErrors(doc: Document.Parsed, rule: string): boolean {
    for (const err of doc.errors) {
      const start = this.lines.at(this.baseOffset + err.pos[0]);
      this.diagnostics.push({
        rule: `${this.rulePrefix}/${rule}`,
        severity: "error",
        message: `YAML parse error: ${err.message.split("\n")[0]}`,
        position: { line: start.line, column: start.column },
      });
    }
    return doc.errors.length > 0;
  }
}

/**
 * Parses YAML under the spec's profile — the failsafe schema: maps, sequences
 * and strings, nothing else, so `1.10` stays four characters and `2026-07-09`
 * stays a string. Anchors, aliases, custom tags, directives and multi-document
 * streams are rejected. Returns undefined when nothing usable was parsed.
 */
export function parseProfiled(ctx: YamlContext, yamlText: string): Document.Parsed | undefined {
  const docs = parseAllDocuments(yamlText, { schema: "failsafe" });
  const doc = docs[0];
  if (doc === undefined) return undefined;
  if (docs.length > 1) {
    ctx.report(
      "profile",
      "error",
      "Multi-document YAML streams must not appear",
      docs[1]!.contents,
    );
  }
  if (doc.directives.yaml.explicit) {
    ctx.report("profile", "error", "YAML directives must not appear");
  }
  visit(doc, {
    Node(_key, node) {
      if (node.anchor !== undefined) {
        ctx.report("profile", "error", `YAML anchors must not appear (\`&${node.anchor}\`)`, node);
      }
      if (node.tag !== undefined) {
        ctx.report("profile", "error", `YAML tags must not appear (\`${node.tag}\`)`, node);
      }
    },
    Alias(_key, node) {
      ctx.report("profile", "error", `YAML aliases must not appear (\`*${node.source}\`)`, node);
    },
  });
  return doc;
}

export function asString(ctx: YamlContext, pair: Pair, keyPath: string): string | undefined {
  const value = pair.value;
  if (isScalar(value) && typeof value.value === "string") return value.value;
  ctx.report("type", "error", `\`${keyPath}\` must be a string`, value ?? pair.key);
  return undefined;
}

/** The profile types booleans as exactly the string `true` or `false`. */
export function asBoolean(ctx: YamlContext, pair: Pair, keyPath: string): boolean | undefined {
  const value = pair.value;
  if (isScalar(value) && (value.value === "true" || value.value === "false")) {
    return value.value === "true";
  }
  ctx.report(
    "type",
    "error",
    `\`${keyPath}\` must be exactly \`true\` or \`false\``,
    value ?? pair.key,
  );
  return undefined;
}

export function asStringList(ctx: YamlContext, pair: Pair, keyPath: string): string[] | undefined {
  const value = pair.value;
  if (!isSeq(value)) {
    ctx.report("type", "error", `\`${keyPath}\` must be a list`, value ?? pair.key);
    return undefined;
  }
  const out: string[] = [];
  for (const item of value.items) {
    if (isScalar(item) && typeof item.value === "string") {
      out.push(item.value);
    } else {
      ctx.report("type", "error", `\`${keyPath}\` entries must be strings`, item);
    }
  }
  return out;
}

export function asUrl(ctx: YamlContext, pair: Pair, keyPath: string): string | undefined {
  const value = asString(ctx, pair, keyPath);
  if (value === undefined) return undefined;
  if (!URL.canParse(value)) {
    ctx.report("format", "error", `\`${keyPath}\` is not a valid URL: \`${value}\``, pair.value);
    return undefined;
  }
  return value;
}

export function eachPair(
  ctx: YamlContext,
  node: unknown,
  knownKeys: readonly string[],
  keyPath: string,
  unknownSeverity: Severity,
  handle: (key: string, pair: Pair) => void,
): void {
  if (!isMap(node)) return;
  for (const pair of node.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : undefined;
    if (key === undefined) continue;
    if (key.startsWith("x-")) continue; // the experimentation escape valve: never validated
    if (!knownKeys.includes(key)) {
      const where = keyPath ? `\`${keyPath}\`` : "the frontmatter";
      ctx.report(
        "unknown-key",
        unknownSeverity,
        `Unknown key \`${key}\` in ${where}${unknownSeverity === "error" ? " — the key set is closed" : ""}`,
        pair.key,
      );
      continue;
    }
    handle(key, pair);
  }
}

export type { Pair, YamlNode };
export { isAlias, isMap, isScalar, isSeq };
