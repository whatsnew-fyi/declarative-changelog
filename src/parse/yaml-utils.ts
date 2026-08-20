import { type Document, isMap, isScalar, isSeq, type Pair, type Node as YamlNode } from "yaml";
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

export function asString(ctx: YamlContext, pair: Pair, keyPath: string): string | undefined {
  const value = pair.value;
  if (isScalar(value) && typeof value.value === "string") return value.value;
  if (isScalar(value) && (typeof value.value === "number" || typeof value.value === "boolean")) {
    ctx.report(
      "type",
      "error",
      `\`${keyPath}\` must be a string, got ${typeof value.value} \`${String(value.value)}\` — quote the value`,
      value,
    );
    return undefined;
  }
  ctx.report("type", "error", `\`${keyPath}\` must be a string`, value ?? pair.key);
  return undefined;
}

export function asBoolean(ctx: YamlContext, pair: Pair, keyPath: string): boolean | undefined {
  const value = pair.value;
  if (isScalar(value) && typeof value.value === "boolean") return value.value;
  ctx.report("type", "error", `\`${keyPath}\` must be a boolean`, value ?? pair.key);
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
    if (isScalar(item) && (typeof item.value === "string" || typeof item.value === "number")) {
      out.push(String(item.value));
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
export { isMap, isScalar, isSeq };
