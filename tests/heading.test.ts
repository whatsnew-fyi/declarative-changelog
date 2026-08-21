import { describe, expect, it } from "vitest";
import { parse, validate } from "./helpers.js";

describe("release heading grammar", () => {
  it("parses all four conformant shapes from the spec", () => {
    const view = parse(
      [
        "## [2.4.0](https://kestrel.example/releases/2.4.0) — 2026-07-09",
        "## 2.3.0 — 2026-07-08",
        "## Parallel task graphs — 2026-07-07",
        "## 2026-07-06",
      ].join("\n\nBody.\n\n"),
    );
    expect(view.entries).toHaveLength(4);
    expect(view.entries[0]).toMatchObject({
      version: "2.4.0",
      url: "https://kestrel.example/releases/2.4.0",
      date: "2026-07-09",
    });
    expect(view.entries[1]!.version).toBe("2.3.0");
    expect(view.entries[1]!.url).toBe("https://kestrel.example/changelog"); // canonical fallback, no fabricated fragment
    expect(view.entries[2]).toMatchObject({ title: "Parallel task graphs" });
    expect(view.entries[2]!.version).toBeUndefined();
    expect(view.entries[3]!.version).toBeUndefined();
    expect(view.entries[3]!.title).toBeUndefined();
    expect(view.entries[3]!.date).toBe("2026-07-06");
  });

  it("splits version: title on the first colon-space", () => {
    const view = parse("## [2.4.0: Parallel task graphs](https://x.example/r) — 2026-07-09");
    expect(view.entries[0]).toMatchObject({ version: "2.4.0", title: "Parallel task graphs" });
  });

  it("does not mistake an em dash inside a title for the separator", () => {
    const view = parse("## Watch mode — rewritten from scratch — 2026-05-02");
    expect(view.entries[0]!.title).toBe("Watch mode — rewritten from scratch");
  });

  it("accepts all three separators", () => {
    const view = parse(
      ["## 3.0.0 — 2026-07-09", "## 2.0.0 – 2026-07-08", "## 1.0.0 - 2026-07-07"].join("\n\n"),
    );
    expect(view.entries.map((e) => e.version)).toEqual(["3.0.0", "2.0.0", "1.0.0"]);
  });

  it("a date-bearing heading that does not parse is a candidate failure — an error", () => {
    const result = validate("## Release notes for 2026-05-02\n\nBody.");
    expect(result.entryCount).toBe(0);
    const error = result.diagnostics.find((d) => d.rule === "heading/candidate-does-not-parse");
    expect(error?.severity).toBe("error");
    expect(result.level).toBe(0);
    expect(result.skipped.candidates).toBe(1);
  });

  it("diagnoses near-misses: unpadded dates and no-break spaces", () => {
    const unpadded = validate("## 2026-7-9\n\nBody.");
    expect(
      unpadded.diagnostics.find((d) => d.rule === "heading/candidate-does-not-parse")?.message,
    ).toContain("unpadded");
    const nbsp = validate("## 2.4.0\u00A0\u2014\u00A02026-05-02\n\nBody.");
    expect(
      nbsp.diagnostics.find((d) => d.rule === "heading/candidate-does-not-parse")?.message,
    ).toContain("no-break space");
  });

  it("a tag run that fails the tag grammar is not a tag run, so the heading fails", () => {
    const result = validate("## 2.4.0 — 2026-07-09 (special build)\n\nBody.");
    expect(result.entryCount).toBe(0);
    expect(result.diagnostics.map((d) => d.rule)).toContain("heading/candidate-does-not-parse");
  });

  it("skips Unreleased silently", () => {
    const result = validate("## Unreleased\n\nSoon.\n\n## 1.0.0 — 2026-07-09\n\nDone.");
    expect(result.entryCount).toBe(1);
    expect(result.diagnostics.map((d) => d.rule)).not.toContain("heading/skipped");
  });

  it("reads a PEP 440 spelling as a title, not a version", () => {
    const view = parse("## 1.0rc1 — 2026-07-09");
    expect(view.entries[0]!.version).toBeUndefined();
    expect(view.entries[0]!.title).toBe("1.0rc1");
  });

  it("parses tags and timestamps", () => {
    const view = parse("## 2.4.1 — 2026-07-14T09:12:00Z (yanked, routine)");
    expect(view.entries[0]).toMatchObject({ routine: true, yanked: true });
  });

  it("platform tokens are no longer tags — a consumer drops the token, keeps the release", () => {
    const result = validate("## 2.4.1 — 2026-07-14 (routine, linux)\n\nBody.");
    expect(result.entryCount).toBe(1);
    expect(result.diagnostics.find((d) => d.rule === "heading/unknown-tag")?.message).toContain(
      "linux",
    );
  });

  it("rejects unknown tags as a validation error, keeping the entry", () => {
    const result = validate("## 2.4.0 — 2026-07-09 (lst)\n\nBody.");
    expect(result.entryCount).toBe(1);
    const error = result.diagnostics.find((d) => d.rule === "heading/unknown-tag");
    expect(error?.severity).toBe("error");
    expect(error?.message).toContain("lst");
  });

  it("rejects impossible calendar dates", () => {
    const result = validate("## 2.4.0 — 2026-02-30\n\nBody.");
    expect(result.diagnostics.map((d) => d.rule)).toContain("heading/invalid-date");
  });

  it("a version with a semver pre-release suffix is a pre-release, no flag needed", () => {
    const view = parse("## 3.0.0-rc.1 — 2026-07-24\n\nBody.");
    expect(view.entries[0]!.prerelease).toBe(true);
  });
});
