import pc from "picocolors";
import type { Diagnostic, Severity } from "../diagnostics.js";
import type { ValidationResult } from "../index.js";

const SEVERITY_LABEL: Record<Severity, (s: string) => string> = {
  error: (s) => pc.red(s),
  warning: (s) => pc.yellow(s),
  info: (s) => pc.cyan(s),
};

export function formatPretty(results: readonly ValidationResult[], quiet: boolean): string {
  const lines: string[] = [];
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const result of results) {
    errors += result.counts.error;
    warnings += result.counts.warning;
    infos += result.counts.info;

    const shown = result.diagnostics.filter((d) => !quiet || d.severity === "error");
    lines.push(pc.underline(result.file));
    const facts = [
      pc.bold(result.levelName),
      `${result.entryCount} ${result.entryCount === 1 ? "entry" : "entries"}`,
    ];
    if (result.entryCount > 0) {
      facts.push(
        result.addressableEntries === result.entryCount
          ? "addressable"
          : `${result.addressableEntries}/${result.entryCount} addressable`,
      );
    }
    if (result.skipped.headings > 0) {
      const candidates =
        result.skipped.candidates > 0 ? ` (${result.skipped.candidates} candidates)` : "";
      facts.push(`${result.skipped.headings} skipped${candidates}`);
    }
    lines.push(`  ${facts.join(" · ")}`);
    for (const d of shown) lines.push(formatDiagnostic(d));
    if (shown.length === 0) lines.push(pc.dim("  no problems"));
    lines.push("");
  }

  const summary: string[] = [];
  if (errors > 0) summary.push(pc.red(`${errors} ${errors === 1 ? "error" : "errors"}`));
  if (warnings > 0)
    summary.push(pc.yellow(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`));
  if (infos > 0 && !quiet) summary.push(pc.cyan(`${infos} info`));
  lines.push(
    summary.length > 0
      ? `${errors > 0 ? pc.red("✖") : "•"} ${summary.join(", ")}`
      : pc.green("✔ no problems"),
  );
  return lines.join("\n");
}

function formatDiagnostic(d: Diagnostic): string {
  const where = d.position ? `${d.position.line}:${d.position.column}` : "-";
  const severity = SEVERITY_LABEL[d.severity](d.severity.padEnd(7));
  return `  ${pc.dim(where.padEnd(8))} ${severity} ${d.message}  ${pc.dim(d.rule)}`;
}
