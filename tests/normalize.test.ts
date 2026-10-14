import { describe, expect, it } from "vitest";
import { validateChangelog } from "../src/index.js";
import { normalizeChangelog } from "../src/normalize.js";

const STAMP = "2026-10-14T09:30:00Z";

const FRONTMATTER = `---
changelog: "0.1"
product:
  name: Kestrel
  versioning: semver
document:
  updated: 2026-09-01T00:00:00Z
  canonical: https://kestrel.example/changelog
---`;

const HISTORY = `## [1.2.0](https://github.com/acme/kestrel/compare/v1.1.0...v1.2.0) - 2026-09-01T00:00:00Z

### Added

- Retries for flaky uploads.`;

/** What release-please 17 prepends: `(date)` heading, BREAKING CHANGES, tool section names. */
const RELEASE_PLEASE = `${FRONTMATTER}

# Kestrel changelog

## [2.0.0](https://github.com/acme/kestrel/compare/v1.2.0...v2.0.0) (2026-10-14)


### ⚠ BREAKING CHANGES

* **api:** drop the v1 endpoint
* tokens expire after one hour

### Bug Fixes

* handle empty input ([9876543](https://github.com/acme/kestrel/commit/9876543))

### Features

* **api:** drop the v1 endpoint ([abc1234](https://github.com/acme/kestrel/commit/abc1234))
* add a --dry-run flag ([def5678](https://github.com/acme/kestrel/commit/def5678))

${HISTORY}
`;

/** What changesets 2 writes: the entry replaces the file's first newline, inside the frontmatter. */
const CHANGESETS = `---

## 2.0.0

### Major Changes

- abc1234: Drop Node 18.

### Minor Changes

- def5678: Add a --dry-run flag.

### Patch Changes

- 9876543: Handle empty input.
${FRONTMATTER.slice(4)}

# Kestrel changelog

${HISTORY}
`;

function normal(source: string, options = {}) {
  return normalizeChangelog(source, { date: STAMP, ...options });
}

function check(output: string) {
  const result = validateChangelog(output, "out.md");
  return {
    level: result.level,
    problems: result.diagnostics
      .filter((d) => d.severity !== "info")
      .map((d) => `${d.rule}: ${d.message}`),
  };
}

describe("normalize — release-please", () => {
  it("rewrites the heading, marks breaking items where they belong, and conforms", () => {
    expect(check(RELEASE_PLEASE).level).toBe(0);
    const { output, changes } = normal(RELEASE_PLEASE);
    expect(check(output)).toEqual({ level: 2, problems: [] });
    expect(output).toContain(
      "## [2.0.0](https://github.com/acme/kestrel/compare/v1.2.0...v2.0.0) - 2026-10-14\n\n### Added\n\n- **Breaking** — **api:** drop the v1 endpoint ([abc1234](https://github.com/acme/kestrel/commit/abc1234))\n- add a --dry-run flag",
    );
    // No twin: a change in behaviour, filed under Changed.
    expect(output).toContain("### Changed\n\n- **Breaking** — tokens expire after one hour\n");
    expect(output).not.toContain("BREAKING CHANGES");
    // Canonical order: Added, Changed, Fixed.
    expect(output.indexOf("### Added")).toBeLessThan(output.indexOf("### Changed"));
    expect(output.indexOf("### Changed")).toBeLessThan(output.indexOf("### Fixed"));
    // History is untouched, byte for byte.
    expect(output.endsWith(`${HISTORY}\n`)).toBe(true);
    expect(changes[0]).toBe(
      "`## [2.0.0](https://github.com/acme/kestrel/compare/v1.2.0...v2.0.0) (2026-10-14)` → `## [2.0.0](https://github.com/acme/kestrel/compare/v1.2.0...v2.0.0) - 2026-10-14`",
    );
    expect(output).toContain("  updated: 2026-10-14\n");
  });

  it("puts back a frontmatter release-please pushed below its entry", () => {
    const pushed = `# Changelog

## [1.3.0](https://github.com/acme/kestrel/compare/v1.2.0...v1.3.0) (2026-10-14)

### Features

* add a --dry-run flag

${FRONTMATTER}

${HISTORY}
`;
    const { output, changes } = normal(pushed);
    expect(
      output.startsWith(
        `${FRONTMATTER.replace("2026-09-01T00:00:00Z", "2026-10-14")}\n\n# Changelog\n`,
      ),
    ).toBe(true);
    expect(changes).toContain("moved the frontmatter back to the top");
    expect(check(output).problems).toEqual([]);
  });

  it("puts Unreleased back above the entries release-please wrote over it", () => {
    // The first release: release-please's only anchor was `## [Unreleased]`.
    const first = `${FRONTMATTER}

# Kestrel changelog

## 1.0.0 (2026-10-14)


### Features

* first release

## [Unreleased]

[Unreleased]: https://github.com/acme/kestrel/compare/v1.0.0...HEAD
`;
    const once = normal(first);
    expect(once.output).toContain(
      "# Kestrel changelog\n\n## [Unreleased]\n\n## 1.0.0 - 2026-10-14\n\n### Added\n\n- first release\n\n[Unreleased]: https://github.com/acme/kestrel/compare/v1.0.0...HEAD\n",
    );
    expect(once.changes[0]).toBe("moved `## [Unreleased]` back above the new entries");
    expect(check(once.output)).toEqual({ level: 2, problems: [] });

    // Every later release lands above Unreleased again, and below it stays history.
    const later = once.output.replace(
      "## [Unreleased]\n",
      "## [1.1.0](https://github.com/acme/kestrel/compare/v1.0.0...v1.1.0) (2026-10-20)\n\n\n### Bug Fixes\n\n* a fix\n\n## [Unreleased]\n\nNotes for the next one.\n",
    );
    const twice = normal(later).output;
    expect(twice).toContain(
      "# Kestrel changelog\n\n## [Unreleased]\n\nNotes for the next one.\n\n## [1.1.0](https://github.com/acme/kestrel/compare/v1.0.0...v1.1.0) - 2026-10-20\n\n### Fixed\n\n- a fix\n\n## 1.0.0 - 2026-10-14\n",
    );
    expect(normal(twice)).toEqual({ output: twice, changes: [] });
  });

  it("leaves Unreleased alone when it is already on top, or below history only", () => {
    const below = `${FRONTMATTER}\n\n# Kestrel changelog\n\n${HISTORY}\n\n## [Unreleased]\n`;
    expect(normal(below)).toEqual({ output: below, changes: [] });
  });
});

describe("normalize — changesets", () => {
  it("takes the entry out of the frontmatter, dates it, and maps its sections", () => {
    const { output, changes } = normal(CHANGESETS);
    expect(output.startsWith("---\nchangelog:")).toBe(true);
    expect(output).toContain(
      `# Kestrel changelog\n\n## 2.0.0 - ${STAMP}\n\n### Added\n\n- def5678: Add a --dry-run flag.\n\n### Changed\n\n- **Breaking** — abc1234: Drop Node 18.\n\n### Fixed\n\n- 9876543: Handle empty input.\n\n## [1.2.0]`,
    );
    expect(changes[0]).toBe("moved `## 2.0.0` out of the frontmatter");
    expect(check(output)).toEqual({ level: 2, problems: [] });
    expect(output).toContain(`  updated: ${STAMP}\n`);
  });

  it("keeps the bump-level sections when asked, and says it", () => {
    const { output } = normal(CHANGESETS, { keepSections: true });
    expect(output).toContain("### Minor Changes");
    expect(output).toContain("### Major Changes");
    expect(check(output).level).toBe(1);
  });

  it("dates every new entry when a run adds two", () => {
    const two = `${FRONTMATTER}

# Kestrel changelog

## 1.3.1

### Patch Changes

- Fix the fix.

## 1.3.0

### Minor Changes

- Add a thing.

${HISTORY}
`;
    const { output } = normal(two);
    expect(output).toContain(`## 1.3.1 - ${STAMP}`);
    expect(output).toContain(`## 1.3.0 - ${STAMP}`);
    expect(check(output)).toEqual({ level: 2, problems: [] });
  });
});

describe("normalize — what it leaves alone", () => {
  it("returns a conforming document byte for byte, with no changes", () => {
    const doc = `${FRONTMATTER}\n\n# Kestrel changelog\n\n${HISTORY}\n`;
    expect(normal(doc)).toEqual({ output: doc, changes: [] });
  });

  it("is idempotent", () => {
    for (const source of [RELEASE_PLEASE, CHANGESETS]) {
      const once = normal(source).output;
      expect(normal(once)).toEqual({ output: once, changes: [] });
    }
  });

  it("never dates an old entry, even with --all, and never touches Unreleased or code", () => {
    const doc = `${FRONTMATTER}

# Kestrel changelog

## [Unreleased]

${HISTORY}

## 1.1.0

### Fixed

- Old, undated, and staying that way.

\`\`\`md
## 9.9.9 (2026-01-01)
\`\`\`
`;
    const { output } = normal(doc, { all: true });
    expect(output).toContain("## [Unreleased]\n");
    expect(output).toContain("## 1.1.0\n");
    expect(output).toContain("## 9.9.9 (2026-01-01)\n");
  });

  it("repairs history only with --all", () => {
    const doc = `${FRONTMATTER}

# Kestrel changelog

${HISTORY}

## [1.1.0](https://github.com/acme/kestrel/compare/v1.0.0...v1.1.0) (2026-08-01)

### Bug Fixes

* an old fix
`;
    expect(normal(doc).changes).toEqual([]);
    const { output } = normal(doc, { all: true });
    expect(output).toContain(
      "## [1.1.0](https://github.com/acme/kestrel/compare/v1.0.0...v1.1.0) - 2026-08-01\n\n### Fixed\n\n- an old fix\n",
    );
    expect(check(output)).toEqual({ level: 2, problems: [] });
  });

  it("keeps CRLF line endings and a footer of link definitions", () => {
    const doc = `${FRONTMATTER}

# Kestrel changelog

## [1.3.0]

### Features

* add a thing

## [1.2.0] - 2026-09-01T00:00:00Z

### Added

- Retries.

[1.3.0]: https://github.com/acme/kestrel/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/acme/kestrel/releases/tag/v1.2.0
`.replace(/\n/g, "\r\n");
    const { output } = normal(doc);
    expect(output).toContain(`## [1.3.0] - ${STAMP}\r\n\r\n### Added\r\n\r\n- add a thing\r\n`);
    expect(
      output.endsWith("[1.2.0]: https://github.com/acme/kestrel/releases/tag/v1.2.0\r\n"),
    ).toBe(true);
    expect(output).not.toMatch(/[^\r]\n/);
    expect(check(output)).toEqual({ level: 2, problems: [] });
  });

  it("refuses a date the grammar would not accept", () => {
    expect(() => normalizeChangelog("x", { date: "14/10/2026" })).toThrow(/--date/);
  });
});
