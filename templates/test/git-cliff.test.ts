import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bin, commit, conformance, HISTORY, makeRepo, run, tag, template } from "./fixture.js";

const CONFIG = template("git-cliff/cliff.toml");

function cliff(repo: string, args: string[]): string {
  run(repo, bin("git-cliff"), ["--config", CONFIG, ...args]);
  return readFileSync(join(repo, "CHANGELOG.md"), "utf8");
}

describe("git-cliff", () => {
  it("writes the whole history as a conforming document", async () => {
    const out = cliff(makeRepo(), ["--output", "CHANGELOG.md"]);
    expect(conformance(out)).toEqual({ level: 2, problems: [] });
    expect(out).toContain(
      "## [1.1.1](https://github.com/acme/kestrel/releases/tag/v1.1.1) - 2026-02-11T09:00:00Z (routine)\n",
    );
    await expect(out).toMatchFileSnapshot("golden/git-cliff.md");
  });

  it("adds a release with --prepend, replacing the header rather than repeating it", async () => {
    const repo = makeRepo(HISTORY.slice(0, -1));
    const before = cliff(repo, ["--output", "CHANGELOG.md"]);
    for (const change of HISTORY.at(-1)!.commits) commit(repo, change.date, change.message);
    tag(repo, "v2.1.0", "2026-04-03T10:00:00Z");
    const out = cliff(repo, ["--latest", "--prepend", "CHANGELOG.md"]);

    expect(conformance(out)).toEqual({ level: 2, problems: [] });
    expect(out.match(/^changelog: "0\.1"$/gm)).toHaveLength(1);
    expect(out).toContain("  updated: 2026-04-02T09:00:00Z\n");
    expect(out.indexOf("## [2.1.0]")).toBeLessThan(out.indexOf("## [2.0.0]"));
    // Everything below the new entry is the file as it was.
    const history = before.slice(before.indexOf("## [2.0.0]"));
    expect(out.endsWith(history)).toBe(true);
  });
});
