import type { Diagnostic, Severity } from "../diagnostics.js";
import type { ValidationResult } from "../index.js";

/**
 * GitHub Actions workflow commands: one annotation per diagnostic, which the
 * runner pins to the file and line in the PR's diff view, then a plain summary
 * line per file for the log.
 *
 *   ::error file=CHANGELOG.md,line=12,col=1,title=heading/unknown-tag::Unknown tag `lst` — …
 */

const COMMAND: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "notice",
};

/** The workflow-command escaping for a message. */
function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Property values also escape the two characters that delimit properties. */
function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function annotation(file: string, d: Diagnostic): string {
  const properties: string[] = [`file=${escapeProperty(file)}`];
  if (d.position) {
    properties.push(`line=${d.position.line}`, `col=${d.position.column}`);
    if (d.position.endLine !== undefined) properties.push(`endLine=${d.position.endLine}`);
    if (d.position.endColumn !== undefined) properties.push(`endColumn=${d.position.endColumn}`);
  }
  properties.push(`title=${escapeProperty(d.rule)}`);
  return `::${COMMAND[d.severity]} ${properties.join(",")}::${escapeData(d.message)}`;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatGithub(results: readonly ValidationResult[], quiet: boolean): string {
  const lines: string[] = [];
  for (const result of results) {
    for (const d of result.diagnostics) {
      if (quiet && d.severity !== "error") continue;
      lines.push(annotation(result.file, d));
    }
    const { error, warning, info } = result.counts;
    lines.push(
      `${result.file}: ${result.levelName}, ${count(result.entryCount, "entry", "entries")} · ${count(error, "error")}, ${count(warning, "warning")}, ${info} info`,
    );
  }
  return lines.join("\n");
}
