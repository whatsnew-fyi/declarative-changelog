import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bin,
  commit,
  conformance,
  git,
  makeRepo,
  REPO_URL,
  run,
  tag,
  template,
} from "./fixture.js";

const FAKE_NOW = fileURLToPath(new URL("./fake-now.mjs", import.meta.url));

/** A fixture repository set up as a project using commit-and-tag-version. */
function project(): string {
  const repo = makeRepo();
  copyFileSync(template("commit-and-tag-version/.versionrc.mjs"), join(repo, ".versionrc.mjs"));
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify({ name: "kestrel", version: "2.0.0", repository: REPO_URL }, null, 2)}\n`,
  );
  return repo;
}

function release(repo: string, now: string, args: string[] = []): string {
  run(repo, bin("commit-and-tag-version"), ["--skip.commit", "--skip.tag", ...args], {
    FAKE_NOW: now,
    NODE_OPTIONS: `--import ${FAKE_NOW}`,
  });
  return readFileSync(join(repo, "CHANGELOG.md"), "utf8");
}

describe("commit-and-tag-version", () => {
  it("writes every release from the tags with --release-count 0", async () => {
    const out = release(project(), "2026-04-03T10:00:00Z", ["--release-count", "0"]);
    expect(conformance(out)).toEqual({ level: 2, problems: [] });
    expect(out).toContain("## [1.1.1](https://github.com/acme/kestrel/releases/tag/v1.1.1) - ");
    expect(out).toMatch(/^## \[1\.1\.1\]\(.*\) - \S+ \(routine\)$/m);
    await expect(out).toMatchFileSnapshot("golden/commit-and-tag-version.md");
  });

  it("adds the next release under the header, once", () => {
    const repo = project();
    const first = release(repo, "2026-04-03T10:00:00Z", ["--release-count", "0"]);
    git(repo, ["add", "--all"]);
    git(repo, ["commit", "--quiet", "--message", "chore(release): 2.1.0"], "2026-04-03T10:00:00Z");
    tag(repo, "v2.1.0", "2026-04-03T10:00:00Z");
    commit(repo, "2026-04-10T10:00:00Z", "build(deps): bump yaml");

    const out = release(repo, "2026-04-11T08:00:00Z");
    expect(conformance(out)).toEqual({ level: 2, problems: [] });
    expect(out.match(/^changelog: "0\.1"$/gm)).toHaveLength(1);
    expect(out).toContain("  updated: 2026-04-11T08:00:00Z\n");
    expect(out).toContain(
      "# Kestrel changelog\n\n## [2.1.1](https://github.com/acme/kestrel/releases/tag/v2.1.1) - 2026-04-11T08:00:00Z (routine)\n\n## [2.1.0]",
    );
    expect(out.endsWith(first.slice(first.indexOf("## [2.1.0]")))).toBe(true);
  });
});
