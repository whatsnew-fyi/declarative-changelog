import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateChangelog } from "../../src/index.js";

/**
 * Kestrel's history as Conventional Commits: every category, the three
 * extension types, a `!` breaking change, a BREAKING CHANGE footer, a breaking
 * commit of a hidden type, a release of nothing but hidden types (1.1.1), and
 * two commits not yet released.
 */
export interface Release {
  /** The tag, or undefined for commits not yet released. */
  tag?: string;
  /** When the tag was made. */
  date?: string;
  commits: { date: string; message: string; body?: string }[];
}

export const HISTORY: Release[] = [
  {
    tag: "v1.0.0",
    date: "2026-01-10T09:00:00Z",
    commits: [{ date: "2026-01-10T09:00:00Z", message: "feat: first release" }],
  },
  {
    tag: "v1.1.0",
    date: "2026-02-02T10:00:00Z",
    commits: [
      { date: "2026-01-20T09:00:00Z", message: "feat: add a --dry-run flag" },
      { date: "2026-01-21T09:00:00Z", message: "fix: handle empty input (#12)" },
      {
        date: "2026-01-22T09:00:00Z",
        message: "security: reject task manifests fetched over plain HTTP",
      },
      { date: "2026-01-23T09:00:00Z", message: "deprecate: --serial, in favour of --jobs 1" },
      { date: "2026-01-24T09:00:00Z", message: "perf(graph): cache the resolved task graph" },
      { date: "2026-01-25T09:00:00Z", message: "docs: explain --jobs" },
      { date: "2026-01-26T09:00:00Z", message: "chore: bump dependencies" },
    ],
  },
  {
    tag: "v1.1.1",
    date: "2026-02-20T10:00:00Z",
    commits: [
      { date: "2026-02-10T09:00:00Z", message: "chore: refresh the lockfile" },
      { date: "2026-02-11T09:00:00Z", message: "ci: test on Node 24" },
    ],
  },
  {
    tag: "v2.0.0",
    date: "2026-03-14T10:00:00Z",
    commits: [
      { date: "2026-03-01T09:00:00Z", message: "remove!: drop --serial, deprecated in 1.1.0" },
      {
        date: "2026-03-02T09:00:00Z",
        message: "remove: drop KESTREL_LEGACY_RESOLVER, a no-op since 1.0",
      },
      {
        date: "2026-03-03T09:00:00Z",
        message: "perf: run task graphs in parallel by default",
        body: "BREAKING CHANGE: tasks with undeclared dependencies may now race; declare them.",
      },
      { date: "2026-03-04T09:00:00Z", message: "build!: require Node 22" },
      { date: "2026-03-05T09:00:00Z", message: "fix(cli): exit 2 on an unknown flag" },
      { date: "2026-03-06T09:00:00Z", message: "refactor: split the scheduler" },
    ],
  },
  {
    commits: [
      { date: "2026-04-01T09:00:00Z", message: "feat: add watch mode" },
      { date: "2026-04-02T09:00:00Z", message: "fix: keep the cache across restarts" },
    ],
  },
];

export const REPO_URL = "https://github.com/acme/kestrel";

/** Git that reads nothing from this machine's configuration, so every hash is the same everywhere. */
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Kestrel Bot",
  GIT_AUTHOR_EMAIL: "bot@kestrel.example",
  GIT_COMMITTER_NAME: "Kestrel Bot",
  GIT_COMMITTER_EMAIL: "bot@kestrel.example",
};

export function git(cwd: string, args: string[], date?: string): string {
  const env = date ? { ...ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : ENV;
  return execFileSync("git", args, { cwd, env, encoding: "utf8" });
}

/** Any other command, with the same isolated git underneath. */
export function run(cwd: string, command: string, args: string[], env = {}): string {
  return execFileSync(command, args, {
    cwd,
    env: { ...ENV, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let counter = 0;

export function commit(cwd: string, date: string, message: string, body?: string): void {
  counter += 1;
  writeFileSync(join(cwd, `change-${counter}.txt`), `${message}\n`);
  git(cwd, ["add", "--all"]);
  git(cwd, ["commit", "--quiet", "--message", message, ...(body ? ["--message", body] : [])], date);
}

export function tag(cwd: string, name: string, date: string): void {
  git(cwd, ["tag", "--annotate", name, "--message", name], date);
}

/** A fresh repository holding the history, tagged as it was released. */
export function makeRepo(history: Release[] = HISTORY): string {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-"));
  git(dir, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  counter = 0;
  for (const release of history) {
    for (const change of release.commits) commit(dir, change.date, change.message, change.body);
    if (release.tag && release.date) tag(dir, release.tag, release.date);
  }
  return dir;
}

/** A binary from this package's node_modules. */
export function bin(name: string): string {
  return fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));
}

/** A template file, by its path under templates/. */
export function template(path: string): string {
  return fileURLToPath(new URL(`../${path}`, import.meta.url));
}

/** The conformance level and every warning or error, by the validator's own reading. */
export function conformance(markdown: string) {
  const result = validateChangelog(markdown, "CHANGELOG.md");
  return {
    level: result.level,
    problems: result.diagnostics
      .filter((d) => d.severity !== "info")
      .map((d) => `${d.position?.line ?? 0}:${d.rule}: ${d.message}`),
  };
}
