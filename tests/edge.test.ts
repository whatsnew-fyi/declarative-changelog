import { describe, expect, it } from "vitest";
import { loadArchiveChain, validateChangelog } from "../src/index.js";
import { doc, parse, rules, validate } from "./helpers.js";

describe("escape hatch value validation", () => {
  const hatch = (yaml: string) =>
    rules(`## 2.4.0 — 2026-07-09\n\n\`\`\`changelog\n${yaml}\n\`\`\`\n\nBody.`);

  it("rejects wrong value types per key", () => {
    expect(hatch("channel: [a, b]")).toContain("hatch/type");
    expect(hatch('prerelease: "yes"')).toContain("hatch/type");
    expect(hatch("platforms: linux")).toContain("hatch/type");
    expect(hatch('covers: "2.3.1"')).toContain("hatch/type");
    expect(hatch("platforms: [linux, amiga]")).toContain("hatch/unknown-platform");
  });

  it("rejects unparseable URLs and impossible dates", () => {
    expect(hatch("url: not a url")).toContain("hatch/format");
    expect(hatch("date: 2026-13-01")).toContain("hatch/invalid-date");
  });

  it("rejects a hatch that is not a YAML map, or not YAML at all", () => {
    expect(hatch("- just\n- a list")).toContain("hatch/invalid-yaml");
    expect(hatch("{{ not: yaml")).toContain("hatch/invalid-yaml");
  });

  it("rejects a second hatch in one entry", () => {
    const ids = rules(
      "## 2.4.0 — 2026-07-09\n\n```changelog\nchannel: lts\n```\n\n```changelog\nid: x\n```\n\nBody.",
    );
    expect(ids).toContain("hatch/duplicate");
  });

  it("a date override replaces an invalid heading date", () => {
    const view = parse(
      '## 2.4.0 — 2026-07-09\n\n```changelog\ndate: "2026-07-09T10:00:00Z"\n```\n\nBody.',
    );
    expect(view.entries[0]!.date).toBe("2026-07-09T10:00:00Z");
  });
});

describe("date edge cases", () => {
  it("accepts offsets and fractional seconds, case-insensitive T and Z", () => {
    const result = validate("## 2.4.0 — 2026-07-09T10:00:00+02:00\n\nBody.");
    expect(result.counts.error).toBe(0);
    expect(validate("## 2.4.0 — 2026-07-09T10:00:00.500Z\n\nBody.").counts.error).toBe(0);
    expect(validate("## 2.4.0 — 2026-07-09t10:00:00z\n\nBody.").counts.error).toBe(0);
  });

  it("rejects impossible times and offsets", () => {
    expect(rules("## 2.4.0 — 2026-07-09T25:00:00Z\n\nBody.")).toContain("heading/invalid-date");
    expect(rules("## 2.4.0 — 2026-07-09T10:00:00+15:00\n\nBody.")).toContain(
      "heading/invalid-date",
    );
  });

  it("a time without seconds and an offset fails the grammar — a candidate error", () => {
    expect(rules("## 2.4.0 — 2026-07-09T10:00\n\nBody.")).toContain(
      "heading/candidate-does-not-parse",
    );
  });

  it("leap years are real dates", () => {
    expect(rules("## 2.4.0 — 2028-02-29\n\nBody.")).not.toContain("heading/invalid-date");
    expect(rules("## 2.4.0 — 2026-02-29\n\nBody.")).toContain("heading/invalid-date");
  });

  it("orders a timestamped entry against a date-only one as midnight UTC", () => {
    const ids = rules("## 2.4.1 — 2026-07-09T18:00:00Z\n\nNew.\n\n## 2.4.0 — 2026-07-09\n\nOld.");
    expect(ids).not.toContain("order/not-newest-first");
  });
});

describe("frontmatter shape errors", () => {
  it("rejects non-map product and document", () => {
    expect(
      rules("## 2026-07-09\n\nBody.", '---\nchangelog: "0.1"\nproduct: kestrel\n---'),
    ).toContain("frontmatter/type");
    expect(
      rules("## 2026-07-09\n\nBody.", '---\nchangelog: "0.1"\ndocument: partial\n---'),
    ).toContain("frontmatter/type");
  });

  it("rejects bad coverage and locale values", () => {
    expect(
      rules("## 2026-07-09\n\nBody.", '---\nchangelog: "0.1"\ndocument:\n  coverage: full\n---'),
    ).toContain("frontmatter/invalid-coverage");
    expect(
      rules(
        "## 2026-07-09\n\nBody.",
        '---\nchangelog: "0.1"\ndocument:\n  locale: "english!"\n---',
      ),
    ).toContain("frontmatter/invalid-locale");
  });

  it("rejects broken frontmatter YAML", () => {
    const result = validateChangelog("---\n{{ not: yaml\n---\n\n## 2026-07-09\n\nBody.\n", "t.md");
    expect(result.diagnostics.map((d) => d.rule)).toContain("frontmatter/invalid-yaml");
    expect(result.level).toBe(0);
  });
});

describe("inline flattening", () => {
  it("flattens code spans in headings", () => {
    const view = parse("## `2.4.0` — 2026-07-09\n\nBody.");
    expect(view.entries[0]!.version).toBe("2.4.0");
  });

  it("flattens markup and images in the summary, skipping raw HTML tags", () => {
    const view = parse(
      "## 2.4.0 — 2026-07-09\n\n> The **new** ![task tree](x.png) view is <b>live</b> at [docs](https://x.example).",
    );
    expect(view.entries[0]!.summary).toBe("The new task tree view is live at docs.");
  });
});

describe("document shape edge cases", () => {
  it("warns on multiple # titles, keeping the first", () => {
    const result = validateChangelog(doc("# Second title\n\n## 2026-07-09\n\nBody."), "t.md");
    expect(result.diagnostics.map((d) => d.rule)).toContain("document/multiple-titles");
  });

  it("an # inside an entry is body content, not a new title", () => {
    const result = validateChangelog(doc("## 2026-07-09\n\n# Loud body heading\n\nBody."), "t.md");
    expect(result.diagnostics.map((d) => d.rule)).not.toContain("document/multiple-titles");
  });

  it("flags an empty non-image change item", () => {
    expect(rules("## 2.4.0 — 2026-07-09\n\n### Fixed\n\n-\n- Real fix.")).toContain(
      "entry/empty-item",
    );
  });
});

describe("relations by id and archive", () => {
  it("superseded-by resolves by entry id for versionless products", () => {
    const body =
      "## Broken build — 2026-07-09 (yanked)\n\n```changelog\nsuperseded-by: kestrel@2026-07-01\n```\n\nBad.\n\n## Good build — 2026-07-01\n\nFine.";
    expect(rules(body)).not.toContain("relation/superseded-by-unresolved");
  });

  it("a followed archive chain resolves superseded-by across documents", async () => {
    const older = `---\nchangelog: "0.1"\nproduct:\n  name: Kestrel\n---\n\n# Old\n\n## 1.9.0 — 2025-11-02\n\nFinal 1.x.\n`;
    const fetchImpl = (async () => new Response(older, { status: 200 })) as typeof fetch;
    const archive = await loadArchiveChain("https://x.example/1.x.md", 5, fetchImpl);

    const source = doc(
      '## 2.0.0 — 2026-01-10 (yanked)\n\n```changelog\nsuperseded-by: "1.9.0"\n```\n\nBad.',
      '---\nchangelog: "0.1"\nproduct:\n  name: Kestrel\ndocument:\n  coverage: partial\n  older: https://x.example/1.x.md\n---',
    );
    const without = validateChangelog(source, "t.md");
    expect(
      without.diagnostics.find((d) => d.rule === "relation/superseded-by-unresolved")?.severity,
    ).toBe("warning");

    const withArchive = validateChangelog(source, "t.md", { archive });
    expect(withArchive.diagnostics.map((d) => d.rule)).not.toContain(
      "relation/superseded-by-unresolved",
    );
  });

  it("follows a two-document chain and stops at maxDepth", async () => {
    const mid = `---\nchangelog: "0.1"\nproduct:\n  name: Kestrel\ndocument:\n  older: https://x.example/0.x.md\n---\n\n# Mid\n\n## 1.0.0 — 2025-01-01\n\nMid.\n`;
    const oldest = `---\nchangelog: "0.1"\nproduct:\n  name: Kestrel\n---\n\n# Oldest\n\n## 0.9.0 — 2024-06-01\n\nOldest.\n`;
    const fetchImpl = (async (url: string | URL | Request) =>
      new Response(String(url).includes("0.x") ? oldest : mid, { status: 200 })) as typeof fetch;

    const full = await loadArchiveChain("https://x.example/1.x.md", 5, fetchImpl);
    expect(full.versions.has("1.0.0")).toBe(true);
    expect(full.versions.has("0.9.0")).toBe(true);

    const shallow = await loadArchiveChain("https://x.example/1.x.md", 1, fetchImpl);
    expect(shallow.versions.has("1.0.0")).toBe(true);
    expect(shallow.versions.has("0.9.0")).toBe(false);
  });
});

describe("misc rule branches", () => {
  it("warns on a duplicate tag", () => {
    expect(rules("## 2.4.0 — 2026-07-09 (yanked, yanked)\n\nBody.")).toContain(
      "heading/duplicate-tag",
    );
  });

  it("skips version/content agreement across a versionless entry", () => {
    const ids = rules(
      "## 2.4.1 — 2026-07-14\n\n### Added\n\n- New.\n\n## Hotfix notes — 2026-07-10\n\nProse.\n\n## 2.4.0 — 2026-07-09\n\nBody.",
    );
    expect(ids).toContain("semver/added-needs-minor"); // still finds 2.4.0 past the versionless entry
  });
});
