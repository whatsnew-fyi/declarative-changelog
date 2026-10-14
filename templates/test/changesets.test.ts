import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeChangelog } from "../../src/normalize.js";
import { bin, conformance, git, REPO_URL, run } from "./fixture.js";

const SEED = `---
changelog: "0.1"
product:
  name: Kestrel
  homepage: ${REPO_URL}
  versioning: semver
document:
  updated: 2026-03-01T09:00:00Z
  canonical: ${REPO_URL}/blob/main/CHANGELOG.md
---

# Kestrel changelog
`;

function addChangesets(dir: string, changesets: Record<string, [string, string]>, date: string) {
  for (const [name, [bump, summary]] of Object.entries(changesets)) {
    writeFileSync(
      join(dir, ".changeset", `${name}.md`),
      `---\n"kestrel": ${bump}\n---\n\n${summary}\n`,
    );
  }
  git(dir, ["add", "--all"]);
  git(dir, ["commit", "--quiet", "--message", "chore: add changesets"], date);
}

/** `changeset version`, then normalize as the template's version script runs it. */
function version(dir: string, date: string) {
  run(dir, bin("changeset"), ["version"]);
  const written = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
  const { output, changes } = normalizeChangelog(written, { date });
  writeFileSync(join(dir, "CHANGELOG.md"), output);
  git(dir, ["add", "--all"]);
  git(dir, ["commit", "--quiet", "--message", "chore: version packages"], date);
  return { written, output, changes };
}

/** A package with no releases yet, and a changelog that is only its frontmatter and title. */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-changesets-"));
  git(dir, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  mkdirSync(join(dir, ".changeset"));
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "kestrel", version: "1.0.0", repository: REPO_URL }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, ".changeset", "config.json"),
    `${JSON.stringify({ changelog: "@changesets/cli/changelog", commit: false, baseBranch: "main" }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "CHANGELOG.md"), SEED);
  git(dir, ["add", "--all"]);
  git(dir, ["commit", "--quiet", "--message", "chore: start"], "2026-03-01T09:00:00Z");
  return dir;
}

describe("changesets", () => {
  it("conforms once normalize has run after each `changeset version`", async () => {
    const dir = project();
    addChangesets(
      dir,
      {
        "watch-mode": ["minor", "Add watch mode."],
        "keep-cache": ["patch", "Keep the cache across restarts."],
        "node-22": ["major", "Require Node 22."],
      },
      "2026-04-01T09:00:00Z",
    );
    const first = version(dir, "2026-04-03T10:00:00Z");
    // No heading starts with a version yet, so changesets writes after the
    // file's first line: inside the frontmatter.
    expect(first.written.startsWith("---\n\n## 2.0.0\n")).toBe(true);
    expect(first.changes[0]).toBe("moved `## 2.0.0` out of the frontmatter");
    expect(conformance(first.output)).toEqual({ level: 2, problems: [] });

    addChangesets(dir, { "empty-input": ["patch", "Handle empty input."] }, "2026-04-08T09:00:00Z");
    const second = version(dir, "2026-04-09T10:00:00Z");
    // From then on it writes above `## 2.0.0 - …`, below the title.
    expect(second.written).toContain("# Kestrel changelog\n\n## 2.0.1\n");
    expect(conformance(second.output)).toEqual({ level: 2, problems: [] });
    expect(second.output).toContain("  updated: 2026-04-09T10:00:00Z\n");
    expect(normalizeChangelog(second.output)).toEqual({ output: second.output, changes: [] });
    await expect(second.output).toMatchFileSnapshot("golden/changesets.md");
  });
});
