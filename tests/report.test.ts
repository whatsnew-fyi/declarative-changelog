import { describe, expect, it } from "vitest";
import { validateChangelog } from "../src/index.js";
import { formatGithub } from "../src/report/github.js";
import { formatJson } from "../src/report/json.js";
import { formatPretty } from "../src/report/pretty.js";
import { doc } from "./helpers.js";

const clean = validateChangelog(
  doc("## 2.4.0 — 2026-07-09T10:00:00Z\n\n### Fixed\n\n- A fix."),
  "clean.md",
);
const broken = validateChangelog(doc("## 2.4.0 — 2026-07-09 (lst)\n\nBody."), "broken.md");

describe("pretty reporter", () => {
  it("renders level, entry count and diagnostics with rule ids", () => {
    const out = formatPretty([broken], false);
    expect(out).toContain("broken.md");
    expect(out).toContain("1 entry");
    expect(out).toContain("heading/unknown-tag");
    expect(out).toContain("1 error");
  });

  it("renders a clean run", () => {
    const out = formatPretty([clean], false);
    expect(out).toContain("Level 2 — Categorized");
    expect(out).toContain("no problems");
  });

  it("hides non-errors when quiet", () => {
    const out = formatPretty([broken], true);
    expect(out).toContain("heading/unknown-tag");
    expect(out).not.toContain("info");
  });
});

describe("json reporter", () => {
  it("emits the versioned schema with per-file results and a summary", () => {
    const report = JSON.parse(formatJson([clean, broken]));
    expect(report.schemaVersion).toBe(1);
    expect(report.files).toHaveLength(2);
    expect(report.files[1].counts.error).toBeGreaterThan(0);
    expect(report.summary.error).toBe(report.files[0].counts.error + report.files[1].counts.error);
  });
});

describe("github reporter", () => {
  it("writes one annotation per diagnostic, pinned to the file and line", () => {
    const out = formatGithub([broken], false);
    const line = out.split("\n").find((l) => l.includes("heading/unknown-tag"));
    expect(line).toMatch(
      /^::error file=broken\.md,line=12,col=1,endLine=12,endColumn=\d+,title=heading\/unknown-tag::Unknown tag `lst`/,
    );
    // Info diagnostics become notices, not errors.
    expect(out).toMatch(/^::notice /m);
    expect(out).toContain(
      "broken.md: Level 2 — Categorized, 1 entry · 1 error, 0 warnings, 1 info",
    );
  });

  it("escapes what would end a property or a command", () => {
    const tricky = validateChangelog(doc("## 2.4.0 — 2026-07-09 (lst)\n\nBody."), "a,b:c%.md");
    const line = formatGithub([tricky], true).split("\n")[0]!;
    expect(line).toContain("file=a%2Cb%3Ac%25.md");
    expect(line).not.toContain("\n");
  });

  it("keeps errors only when quiet, and still summarizes", () => {
    const out = formatGithub([broken], true);
    expect(out).not.toMatch(/^::(warning|notice) /m);
    expect(formatGithub([clean], true)).toBe(
      "clean.md: Level 2 — Categorized, 1 entry · 0 errors, 0 warnings, 0 info",
    );
  });
});
