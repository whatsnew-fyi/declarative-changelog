#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  type ValidationResult,
  loadArchiveChain,
  parseChangelog,
  validateChangelog,
} from "./index.js";
import { formatJson } from "./report/json.js";
import { formatPretty } from "./report/pretty.js";

const USAGE = `Usage:
  declarative-changelog validate <file...|->  [options]
  declarative-changelog parse    <file|->     [options]

Validate options:
  --format <pretty|json>   Output format (default: pretty)
  --require-level <1|2>    Fail unless the document reaches this conformance level
  --max-warnings <n>       Fail when more than n warnings are reported
  --follow-older           Fetch the document.older archive chain to resolve superseded-by
  --quiet                  Errors only

Parse options:
  --compact                Single-line JSON (default: pretty-printed)

Exit codes: 0 valid · 1 validation failed · 2 usage or internal error`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "pretty" },
      "require-level": { type: "string" },
      "max-warnings": { type: "string" },
      "follow-older": { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      compact: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "V", default: false },
    },
  });

  if (values.version) {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return 0;
  }

  const [command, ...files] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  if (command === "validate") return validate(files, values);
  if (command === "parse") return parse(files, values);

  console.error(`Unknown command \`${command}\`\n\n${USAGE}`);
  return 2;
}

interface Flags {
  format?: string;
  "require-level"?: string;
  "max-warnings"?: string;
  "follow-older"?: boolean;
  quiet?: boolean;
  compact?: boolean;
}

async function validate(files: string[], flags: Flags): Promise<number> {
  if (files.length === 0) {
    console.error(`validate needs at least one file (or \`-\` for stdin)\n\n${USAGE}`);
    return 2;
  }
  if (flags.format !== "pretty" && flags.format !== "json") {
    console.error(`--format must be pretty or json, got \`${flags.format}\``);
    return 2;
  }
  const requireLevel = flags["require-level"] ? Number(flags["require-level"]) : undefined;
  if (requireLevel !== undefined && requireLevel !== 1 && requireLevel !== 2) {
    console.error("--require-level must be 1 or 2");
    return 2;
  }
  const maxWarnings = flags["max-warnings"] ? Number(flags["max-warnings"]) : undefined;
  if (maxWarnings !== undefined && (!Number.isInteger(maxWarnings) || maxWarnings < 0)) {
    console.error("--max-warnings must be a non-negative integer");
    return 2;
  }

  const results: ValidationResult[] = [];
  for (const file of files) {
    const source = await read(file);
    let result = validateChangelog(source, file === "-" ? "<stdin>" : file);
    const older = result.model.frontmatter.document.older;
    if (flags["follow-older"] && older !== undefined) {
      const archive = await loadArchiveChain(older);
      result = validateChangelog(source, file === "-" ? "<stdin>" : file, { archive });
      for (const failure of archive.failures) {
        result.diagnostics.push({
          rule: "relation/archive-unreachable",
          severity: "warning",
          message: `Could not fetch the archive chain: ${failure}`,
        });
        result.counts.warning++;
      }
    }
    results.push(result);
  }

  console.log(
    flags.format === "json" ? formatJson(results) : formatPretty(results, flags.quiet ?? false),
  );

  const errors = results.reduce((n, r) => n + r.counts.error, 0);
  const warnings = results.reduce((n, r) => n + r.counts.warning, 0);
  if (errors > 0) return 1;
  if (maxWarnings !== undefined && warnings > maxWarnings) return 1;
  if (requireLevel !== undefined && results.some((r) => r.level < requireLevel)) return 1;
  return 0;
}

async function parse(files: string[], flags: Flags): Promise<number> {
  if (files.length !== 1) {
    console.error(`parse takes exactly one file (or \`-\` for stdin)\n\n${USAGE}`);
    return 2;
  }
  const source = await read(files[0]!);
  const view = parseChangelog(source, files[0] === "-" ? "<stdin>" : files[0]!);
  console.log(flags.compact ? JSON.stringify(view) : JSON.stringify(view, null, 2));
  return 0;
}

async function read(file: string): Promise<string> {
  if (file === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(file, "utf8");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
