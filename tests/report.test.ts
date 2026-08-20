import { describe, expect, it } from "vitest";
import { validateChangelog } from "../src/index.js";
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
