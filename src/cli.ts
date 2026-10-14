#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { extractEntry } from "./extract.js";
import {
  loadArchiveChain,
  parseChangelog,
  type ValidationResult,
  validateChangelog,
} from "./index.js";
import { normalizeChangelog } from "./normalize.js";
import { formatGithub } from "./report/github.js";
import { formatJson } from "./report/json.js";
import { formatPretty } from "./report/pretty.js";

const USAGE = `Usage:
  declarative-changelog validate  <file...|->  [options]
  declarative-changelog parse     <file|->     [options]
  declarative-changelog normalize <file...|->  [options]
  declarative-changelog extract   <file|->     [version|latest]

Validate options:
  --format <pretty|json|github>
                           Output format (default: pretty); github writes
                           workflow annotations for GitHub Actions
  --require-level <1|2>    Fail unless the document reaches this conformance level
  --max-warnings <n>       Fail when more than n warnings are reported
  --follow-older           Fetch the document.older archive chain to resolve superseded-by
  --quiet                  Errors only

Parse options:
  --compact                Single-line JSON (default: pretty-printed)

Normalize options (repairs what release-please and changesets write):
  --write                  Rewrite the files in place (default: print the one file)
  --check                  Exit 1 if any file needs normalizing; change nothing
  --date <rfc3339>         Date for new undated entries (default: now, UTC)
  --all                    Repair every entry, not only the new ones (never re-dates)
  --keep-sections          Keep changesets' Major/Minor/Patch Changes sections

Extract prints one entry's notes as markdown (default: latest, skipping yanked).

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
      write: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      date: { type: "string" },
      all: { type: "boolean", default: false },
      "keep-sections": { type: "boolean", default: false },
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
  if (command === "normalize") return normalize(files, values);
  if (command === "extract") return extract(files);

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
  write?: boolean;
  check?: boolean;
  date?: string;
  all?: boolean;
  "keep-sections"?: boolean;
}

async function validate(files: string[], flags: Flags): Promise<number> {
  if (files.length === 0) {
    console.error(`validate needs at least one file (or \`-\` for stdin)\n\n${USAGE}`);
    return 2;
  }
  if (flags.format !== "pretty" && flags.format !== "json" && flags.format !== "github") {
    console.error(`--format must be pretty, json or github, got \`${flags.format}\``);
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

  const quiet = flags.quiet ?? false;
  console.log(
    flags.format === "json"
      ? formatJson(results)
      : flags.format === "github"
        ? formatGithub(results, quiet)
        : formatPretty(results, quiet),
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

async function normalize(files: string[], flags: Flags): Promise<number> {
  const inPlace = flags.write || flags.check;
  if (files.length === 0 || (files.length > 1 && !inPlace)) {
    console.error(
      `normalize takes one file (or \`-\` for stdin), or several with --write or --check\n\n${USAGE}`,
    );
    return 2;
  }
  if (inPlace && files.length > 1 && files.includes("-")) {
    console.error("stdin (`-`) cannot be one of several files");
    return 2;
  }
  if (flags.write && files[0] === "-") {
    console.error("--write needs a file, not stdin");
    return 2;
  }
  let status = 0;
  for (const file of files) {
    const source = await read(file);
    let result: ReturnType<typeof normalizeChangelog>;
    try {
      result = normalizeChangelog(source, {
        ...(flags.date === undefined ? {} : { date: flags.date }),
        all: flags.all ?? false,
        keepSections: flags["keep-sections"] ?? false,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 2;
    }
    const label = file === "-" ? "<stdin>" : file;
    const report = result.changes.length
      ? `${label}: ${result.changes.length} ${result.changes.length === 1 ? "change" : "changes"}\n${result.changes.map((c) => `  ${c}`).join("\n")}`
      : `${label}: already normal`;

    if (flags.check) {
      console.log(report);
      if (result.changes.length) status = 1;
    } else if (flags.write) {
      if (result.changes.length) await writeFile(file, result.output);
      console.log(report);
    } else {
      process.stdout.write(result.output);
      console.error(report);
    }
  }
  return status;
}

async function extract(args: string[]): Promise<number> {
  if (args.length < 1 || args.length > 2) {
    console.error(`extract takes a file (or \`-\`) and an optional version\n\n${USAGE}`);
    return 2;
  }
  const [file, which = "latest"] = args as [string, string?];
  const entry = extractEntry(await read(file), which);
  if (!entry) {
    console.error(
      which === "latest"
        ? `${file}: no release entry to extract`
        : `${file}: no entry for version \`${which}\``,
    );
    return 1;
  }
  process.stdout.write(entry.markdown ? `${entry.markdown}\n` : "");
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
