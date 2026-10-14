import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare } from "@semantic-release/changelog";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../semantic-release/release.config.mjs";
import { conformance, git, HISTORY, makeRepo, REPO_URL } from "./fixture.js";

/**
 * semantic-release's three changelog plugins, called as it calls them: the
 * analyzer picks the bump, the generator writes the notes, the changelog
 * plugin puts them in the file. No remote, no CI, no publish.
 */
type Plugin = [string, Record<string, unknown>];
const plugin = (name: string, from = config) =>
  (from.plugins as (string | Plugin)[]).find(
    (p): p is Plugin => Array.isArray(p) && p[0] === name,
  )![1];

const logger = { log() {}, error() {}, warn() {}, success() {} };

function commitsBetween(repo: string, from: string | undefined, to: string) {
  const out = git(repo, ["log", "--format=%H%x1f%B%x1e", from ? `${from}..${to}` : to]);
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, message] = record.split("\x1f") as [string, string];
      return { hash, message: message.trim() };
    });
}

const BUMP = {
  major: ([a]: number[]) => `${a! + 1}.0.0`,
  minor: ([a, b]: number[]) => `${a}.${b! + 1}.0`,
  patch: ([a, b, c]: number[]) => `${a}.${b}.${c! + 1}`,
};

interface Last {
  gitTag?: string;
  gitHead?: string;
  version?: string;
}

/** One semantic-release run at `ref`: returns the version released, or undefined. */
async function release(repo: string, last: Last, ref: string, when: string, from = config) {
  const commits = commitsBetween(repo, last.gitTag, ref);
  const context = {
    cwd: repo,
    logger,
    commits,
    lastRelease: last,
    options: { repositoryUrl: `${REPO_URL}.git` },
  };
  const type = await analyzeCommits(plugin("@semantic-release/commit-analyzer", from), context);
  const version = last.version
    ? type && BUMP[type as keyof typeof BUMP](last.version.split(".").map(Number))
    : "1.0.0";
  if (!version) return { type, version: undefined };

  vi.setSystemTime(new Date(when));
  const nextRelease = {
    version,
    gitTag: `v${version}`,
    gitHead: git(repo, ["rev-parse", ref]).trim(),
  };
  const notes = await generateNotes(plugin("@semantic-release/release-notes-generator", from), {
    ...context,
    nextRelease,
  });
  await prepare(plugin("@semantic-release/changelog", from), {
    cwd: repo,
    logger,
    nextRelease: { ...nextRelease, notes },
  });
  return { type, version, notes };
}

describe("semantic-release", () => {
  afterEach(() => vi.useRealTimers());

  it("writes each release it makes as a conforming entry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const repo = makeRepo();
    const made: string[] = [];
    let last: Last = {};
    for (const { tag, date } of HISTORY) {
      const ref = tag ?? "HEAD";
      const { type, version } = await release(repo, last, ref, date ?? "2026-04-03T10:00:00Z");
      made.push(`${ref} ${type ?? "none"} ${version ?? "-"}`);
      if (version) last = { gitTag: tag, gitHead: git(repo, ["rev-parse", ref]).trim(), version };
    }
    // Chores alone make no release, so 1.1.1's commits land in 2.0.0.
    expect(made).toEqual([
      "v1.0.0 minor 1.0.0",
      "v1.1.0 minor 1.1.0",
      "v1.1.1 none -",
      "v2.0.0 major 2.0.0",
      "HEAD minor 2.1.0",
    ]);

    const out = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
    expect(conformance(out)).toEqual({ level: 2, problems: [] });
    await expect(out).toMatchFileSnapshot("golden/semantic-release.md");
  });

  it("tags a release of hidden types routine, when a rule of yours makes one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const analyzer = plugin("@semantic-release/commit-analyzer");
    const withRule = {
      ...config,
      plugins: config.plugins.map((p: string | Plugin) =>
        Array.isArray(p) && p[0] === "@semantic-release/commit-analyzer"
          ? [
              p[0],
              {
                ...analyzer,
                releaseRules: [
                  ...(analyzer.releaseRules as object[]),
                  { type: "chore", release: "patch" },
                ],
              },
            ]
          : p,
      ),
    };
    const repo = makeRepo(HISTORY.slice(0, 3));
    const last = { gitTag: "v1.1.0", gitHead: git(repo, ["rev-parse", "v1.1.0"]).trim() };
    const { notes } = await release(
      repo,
      { ...last, version: "1.1.0" },
      "v1.1.1",
      "2026-02-20T10:00:00Z",
      withRule,
    );
    expect(notes?.trim()).toBe(
      "## [1.1.1](https://github.com/acme/kestrel/releases/tag/v1.1.1) - 2026-02-20T10:00:00Z (routine)",
    );
    const out = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
    expect(conformance(out)).toEqual({ level: 2, problems: [] });
  });
});
