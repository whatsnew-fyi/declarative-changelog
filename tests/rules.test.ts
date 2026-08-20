import { describe, expect, it } from "vitest";
import { validateChangelog } from "../src/index.js";
import { doc, parse, rules, validate } from "./helpers.js";

const ENTRY = "## 2.4.0 — 2026-07-09\n\n> Fine.\n\n### Fixed\n\n- A fix.";

describe("frontmatter rules", () => {
  it("requires frontmatter at all", () => {
    const result = validateChangelog(`# Title\n\n${ENTRY}\n`, "test.md");
    expect(result.diagnostics.map((d) => d.rule)).toContain("frontmatter/missing");
    expect(result.level).toBe(0);
  });

  it("requires the changelog key", () => {
    expect(rules(ENTRY, "---\nproduct:\n  name: Kestrel\n---")).toContain(
      "frontmatter/changelog-required",
    );
  });

  it("requires changelog to be a string, not a YAML number", () => {
    const result = validate(ENTRY, "---\nchangelog: 0.1\n---");
    const error = result.diagnostics.find((d) => d.rule === "frontmatter/type");
    expect(error?.message).toContain("quote the value");
  });

  it("warns on an unsupported format version", () => {
    expect(rules(ENTRY, '---\nchangelog: "0.2"\n---')).toContain("frontmatter/unsupported-version");
  });

  it("requires document.older when coverage is partial", () => {
    expect(rules(ENTRY, '---\nchangelog: "0.1"\ndocument:\n  coverage: partial\n---')).toContain(
      "frontmatter/older-required",
    );
    expect(
      rules(
        ENTRY,
        '---\nchangelog: "0.1"\ndocument:\n  coverage: partial\n  older: https://x.example/1.x.md\n---',
      ),
    ).not.toContain("frontmatter/older-required");
  });

  it("rejects a color that is not #RRGGBB", () => {
    expect(rules(ENTRY, '---\nchangelog: "0.1"\nproduct:\n  color: "rgb(1,2,3)"\n---')).toContain(
      "frontmatter/invalid-color",
    );
    expect(rules(ENTRY, '---\nchangelog: "0.1"\nproduct:\n  color: "#A1B2C3"\n---')).not.toContain(
      "frontmatter/invalid-color",
    );
  });

  it("rejects unknown platforms and warns on unknown keys", () => {
    const ids = rules(
      ENTRY,
      '---\nchangelog: "0.1"\nproduct:\n  platforms: [linux, amiga]\n  logo: x.png\n---',
    );
    expect(ids).toContain("frontmatter/unknown-platform");
    expect(ids).toContain("frontmatter/unknown-key");
  });

  it("rejects a broken URL and a fake timestamp", () => {
    const ids = rules(
      ENTRY,
      '---\nchangelog: "0.1"\nproduct:\n  homepage: not a url\ndocument:\n  updated: yesterday\n---',
    );
    expect(ids).toContain("frontmatter/format");
    expect(ids).toContain("frontmatter/invalid-timestamp");
  });
});

describe("ordering and identity", () => {
  it("requires newest first", () => {
    const ids = rules("## 1.0.0 — 2026-01-01\n\nOld.\n\n## 2.0.0 — 2026-06-01\n\nNew.");
    expect(ids).toContain("order/not-newest-first");
  });

  it("flags duplicate derived identifiers", () => {
    const ids = rules("## 2026-07-09\n\nOne.\n\n## 2026-07-09\n\nTwo.");
    expect(ids).toContain("identity/duplicate-id");
  });

  it("an explicit id resolves the collision", () => {
    const ids = rules(
      "## 2026-07-09\n\n```changelog\nid: kestrel@2026-07-09-evening\n```\n\nOne.\n\n## 2026-07-09\n\nTwo.",
    );
    expect(ids).not.toContain("identity/duplicate-id");
  });
});

describe("escape hatch rules", () => {
  it("rejects unknown keys — the set is closed", () => {
    const ids = rules("## 2.4.0 — 2026-07-09\n\n```changelog\nseverity: high\n```\n\nBody.");
    expect(ids).toContain("hatch/unknown-key");
  });

  it("rejects prerelease on a versioned entry", () => {
    const ids = rules("## 2.4.0 — 2026-07-09\n\n```changelog\nprerelease: true\n```\n\nBody.");
    expect(ids).toContain("hatch/prerelease-with-version");
  });

  it("allows prerelease on a versionless entry", () => {
    const body = "## Public beta — 2026-07-09\n\n```changelog\nprerelease: true\n```\n\nBody.";
    expect(rules(body)).not.toContain("hatch/prerelease-with-version");
    expect(parse(body).entries[0]!.prerelease).toBe(true);
  });

  it("rejects a hatch that is not immediately after the heading", () => {
    const ids = rules("## 2.4.0 — 2026-07-09\n\n> Summary.\n\n```changelog\nchannel: lts\n```");
    expect(ids).toContain("hatch/misplaced");
  });

  it("rejects a version override that fails the grammar", () => {
    const ids = rules(
      '## 2.4.0 — 2026-07-09\n\n```changelog\nversion: "338.13 - Stable"\n```\n\nBody.',
    );
    expect(ids).toContain("hatch/invalid-version");
  });

  it("hatch keys override the heading", () => {
    const view = parse(
      '## Release notes — 2026-07-09\n\n```changelog\nversion: "2.4.0"\ntitle: Better title\n```\n\nBody.',
    );
    expect(view.entries[0]).toMatchObject({ version: "2.4.0", title: "Better title" });
  });
});

describe("superseded-by and yanked", () => {
  it("must resolve to an entry that exists", () => {
    const ids = rules(
      '## 2.1.3 — 2026-03-30 (yanked)\n\n```changelog\nsuperseded-by: "9.9.9"\n```\n\nBad build.',
    );
    expect(ids).toContain("relation/superseded-by-unresolved");
  });

  it("resolves against another entry, even an older one", () => {
    const body =
      '## 2.1.3 — 2026-03-30 (yanked)\n\n```changelog\nsuperseded-by: "2.1.2"\n```\n\nBad build.\n\n## 2.1.2 — 2026-03-01\n\nGood build.';
    expect(rules(body)).not.toContain("relation/superseded-by-unresolved");
  });

  it("downgrades to a warning when an unfollowed archive chain exists", () => {
    const result = validate(
      '## 2.1.3 — 2026-03-30 (yanked)\n\n```changelog\nsuperseded-by: "1.9.0"\n```\n\nBad build.',
      '---\nchangelog: "0.1"\ndocument:\n  coverage: partial\n  older: https://x.example/1.x.md\n---',
    );
    const d = result.diagnostics.find((d) => d.rule === "relation/superseded-by-unresolved");
    expect(d?.severity).toBe("warning");
  });

  it("points out a target that is only a covered version", () => {
    const result = validate(
      '## 2.4.0 — 2026-07-09 (yanked)\n\n```changelog\nsuperseded-by: "2.3.1"\n```\n\nBad.\n\n## 2.3.0 — 2026-06-01\n\n```changelog\ncovers: ["2.3.1"]\n```\n\nGood.',
    );
    const d = result.diagnostics.find((d) => d.rule === "relation/superseded-by-unresolved");
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain("covered");
  });

  it("warns when a yanked entry gives no destination", () => {
    expect(rules("## 2.1.3 — 2026-03-30 (yanked)\n\nWithdrawn.")).toContain(
      "relation/yanked-without-superseded-by",
    );
  });

  it("warns when superseded-by is just the next entry on an ordinary release", () => {
    const ids = rules(
      '## 2.2.0 — 2026-04-18\n\nNew.\n\n## 2.1.0 — 2026-03-01\n\n```changelog\nsuperseded-by: "2.2.0"\n```\n\nOld.',
    );
    expect(ids).toContain("relation/superseded-by-noise");
  });
});

describe("entry body rules", () => {
  it("rejects a body that is only a link to the notes", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\nhttps://kestrel.example/releases/2.4.0")).toContain(
      "entry/link-only-body",
    );
    expect(
      rules("## 2.4.0 — 2026-07-09\n\n[Release notes](https://kestrel.example/releases/2.4.0)"),
    ).toContain("entry/link-only-body");
  });

  it("a category section must contain a list and nothing else", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\n### Fixed\n\nProse instead of a list.")).toContain(
      "entry/section-content",
    );
  });

  it("warns on an empty category section", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\n### Fixed\n\n### Added\n\n- A thing.")).toContain(
      "entry/empty-section",
    );
  });

  it("warns on duplicate and out-of-order sections", () => {
    const ids = rules(
      "## 2.4.0 — 2026-07-09\n\n### Fixed\n\n- A fix.\n\n### Added\n\n- A thing.\n\n### Fixed\n\n- Another.",
    );
    expect(ids).toContain("entry/section-order");
    expect(ids).toContain("entry/duplicate-section");
  });

  it("recognizes categories case-insensitively", () => {
    const view = parse("## 2.4.0 — 2026-07-09\n\n### FIXED\n\n- A fix.");
    expect(view.entries[0]!.changes[0]!.category).toBe("Fixed");
    expect(view.entries[0]!.level).toBe(2);
  });

  it("warns on a multi-paragraph summary", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\n> One.\n>\n> Two.\n\nBody.")).toContain(
      "entry/summary-paragraphs",
    );
  });

  it("keeps unrecognized sections legal, at Level 1", () => {
    const result = validate("## 2.1.0 — 2026-03-02\n\n### Scheduler\n\n- Faster.");
    expect(result.counts.error).toBe(0);
    expect(result.level).toBe(1);
    expect(result.diagnostics.map((d) => d.rule)).toContain("conformance/uncategorized-sections");
  });
});

describe("media rules", () => {
  it("flags image-only change items and missing alt text", () => {
    const ids = rules("## 2.4.0 — 2026-07-09\n\n### Added\n\n- ![](https://x.example/shot.png)");
    expect(ids).toContain("media/image-only-item");
    expect(ids).toContain("media/image-alt");
  });

  it("an image with alt text carries its own meaning", () => {
    const ids = rules(
      "## 2.4.0 — 2026-07-09\n\n### Added\n\n- ![The new task tree view](https://x.example/shot.png)",
    );
    expect(ids).not.toContain("media/image-only-item");
    expect(ids).not.toContain("media/image-alt");
  });

  it("warns on raw HTML", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\n<div>styled content</div>")).toContain("media/raw-html");
  });
});

describe("version/content agreement", () => {
  it("flags a breaking change in a patch release", () => {
    const ids = rules(
      "## 2.4.1 — 2026-07-14\n\n### Changed\n\n- **Breaking** — the lockfile format moved.\n\n## 2.4.0 — 2026-07-09\n\nBody.",
    );
    expect(ids).toContain("semver/breaking-needs-major");
  });

  it("flags additions in a patch release", () => {
    const ids = rules(
      "## 2.4.1 — 2026-07-14\n\n### Added\n\n- A new flag.\n\n## 2.4.0 — 2026-07-09\n\nBody.",
    );
    expect(ids).toContain("semver/added-needs-minor");
  });

  it("accepts a proper major bump and skips 0.x and finalizations", () => {
    expect(
      rules(
        "## 3.0.0 — 2026-07-14\n\n### Removed\n\n- **Breaking** — gone.\n\n## 2.4.0 — 2026-07-09\n\nBody.",
      ),
    ).not.toContain("semver/breaking-needs-major");
    expect(
      rules("## 0.4.1 — 2026-07-14\n\n### Added\n\n- New.\n\n## 0.4.0 — 2026-07-09\n\nBody."),
    ).not.toContain("semver/added-needs-minor");
    expect(
      rules("## 2.5.0 — 2026-07-14\n\n### Added\n\n- New.\n\n## 2.5.0-rc.1 — 2026-07-09\n\nBody."),
    ).not.toContain("semver/added-needs-minor");
  });

  it("compares within a channel only", () => {
    const ids = rules(
      "## 2.4.1 — 2026-07-14\n\n### Added\n\n- New.\n\n## 2.2.9 — 2026-07-01\n\n```changelog\nchannel: lts\n```\n\nBody.",
    );
    expect(ids).not.toContain("semver/added-needs-minor");
  });
});

describe("document shape", () => {
  it("notes an empty document", () => {
    const result = validateChangelog(doc(""), "test.md");
    expect(result.diagnostics.map((d) => d.rule)).toContain("document/no-entries");
  });

  it("warns when the # title is missing", () => {
    const result = validateChangelog(`---\nchangelog: "0.1"\n---\n\n${ENTRY}\n`, "test.md");
    expect(result.diagnostics.map((d) => d.rule)).toContain("document/title-missing");
  });
});
