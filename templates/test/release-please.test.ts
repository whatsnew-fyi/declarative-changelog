import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeChangelog } from "../../src/normalize.js";
import { conformance, git, HISTORY, makeRepo, template } from "./fixture.js";

/**
 * release-please's own changelog code, run offline: its commit parser, the
 * notes builder it uses for a release PR, and the updater that splices the
 * notes into CHANGELOG.md. Then `normalize`, as the template's workflow runs
 * it on the release PR's branch, before the next release lands.
 */
const require = createRequire(import.meta.url);
const { parseConventionalCommits } = require("release-please/build/src/commit");
const { DefaultChangelogNotes } = require("release-please/build/src/changelog-notes/default");
const { Changelog } = require("release-please/build/src/updaters/changelog");
const { Version } = require("release-please/build/src/version");

const sections = JSON.parse(
  readFileSync(template("release-please/release-please-config.json"), "utf8"),
).packages["."]["changelog-sections"];
const seed = readFileSync(template("release-please/CHANGELOG.md"), "utf8");
const quiet = { debug() {}, info() {}, warn() {}, error() {}, trace() {} };

function commitsBetween(repo: string, from: string | undefined, to: string) {
  return git(repo, ["log", "--format=%H%x1f%B%x1e", from ? `${from}..${to}` : to])
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, message] = record.split("\x1f") as [string, string];
      return { sha, message: message.trim(), files: [] };
    });
}

async function releasePr(
  repo: string,
  file: string,
  previous: string | undefined,
  ref: string,
  version: string,
  when: string,
): Promise<string> {
  vi.setSystemTime(new Date(when));
  const commits = commitsBetween(repo, previous, ref);
  const notes = await new DefaultChangelogNotes().buildNotes(
    parseConventionalCommits(commits, quiet),
    {
      host: "https://github.com",
      owner: "acme",
      repository: "kestrel",
      version,
      previousTag: previous,
      currentTag: `v${version}`,
      targetBranch: "main",
      changelogSections: sections,
      commits,
    },
  );
  return new Changelog({ version: Version.parse(version), changelogEntry: notes }).updateContent(
    file,
  );
}

describe("release-please", () => {
  afterEach(() => vi.useRealTimers());

  it("writes a conforming file once normalize has run on each release PR", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const repo = makeRepo();
    // release-please makes no release of chores alone; 1.1.1's commits land in 2.0.0.
    const releases = [
      ["v1.0.0", "1.0.0"],
      ["v1.1.0", "1.1.0"],
      ["v2.0.0", "2.0.0"],
      ["HEAD", "2.1.0"],
    ] as const;
    const dates = Object.fromEntries(HISTORY.map((r) => [r.tag ?? "HEAD", r.date]));

    let file = seed;
    let previous: string | undefined;
    for (const [ref, version] of releases) {
      const when = dates[ref] ?? "2026-04-03T10:00:00Z";
      const written = await releasePr(repo, file, previous, ref, version, when);
      // What release-please writes on its own does not conform.
      expect(conformance(written).problems).not.toEqual([]);
      file = normalizeChangelog(written).output;
      expect(conformance(file)).toEqual({ level: 2, problems: [] });
      previous = ref;
    }
    // Unreleased stays on top, where the next release PR anchors.
    expect(file).toContain("# Kestrel changelog\n\n## [Unreleased]\n\n## [2.1.0]");
    expect(normalizeChangelog(file)).toEqual({ output: file, changes: [] });
    await expect(file).toMatchFileSnapshot("golden/release-please.md");
  });
});
