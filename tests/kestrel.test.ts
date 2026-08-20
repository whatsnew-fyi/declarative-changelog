import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseChangelog, validateChangelog } from "../src/index.js";

const source = readFileSync(new URL("./fixtures/valid/kestrel.md", import.meta.url), "utf8");

describe("the spec's reference example", () => {
  const result = validateChangelog(source, "kestrel.md");

  it("is valid", () => {
    expect(result.counts.error).toBe(0);
    expect(result.counts.warning).toBe(0);
  });

  it("has ten entries and reaches Level 1 (2.1.0 is deliberately uncategorized)", () => {
    expect(result.entryCount).toBe(10);
    expect(result.level).toBe(1);
  });

  it("skips Unreleased and the annotation section — dateless, so not candidates", () => {
    expect(result.model.skipped).toHaveLength(2);
    expect(result.model.skipped.every((s) => !s.candidate)).toBe(true);
    expect(result.skipped).toEqual({ headings: 2, candidates: 0 });
  });

  const view = parseChangelog(source, "kestrel.md");
  const byId = new Map(view.entries.map((e) => [e.id, e]));

  it("maps the yanked entry", () => {
    expect(byId.get("kestrel@2.1.3")).toMatchObject({
      yanked: true,
      supersededBy: "2.2.0",
      platforms: ["linux"],
      prerelease: false,
    });
  });

  it("maps covers, channel, routine and the pre-release", () => {
    expect(byId.get("kestrel@2.3.0")!.covers).toEqual(["2.3.1", "2.3.2"]);
    expect(byId.get("kestrel@2.2.0")!.channel).toBe("lts");
    expect(byId.get("kestrel@2.4.1")!.routine).toBe(true);
    expect(byId.get("kestrel@3.0.0-rc.1")!.prerelease).toBe(true);
  });

  it("keeps the bare-date entry bare — nothing invented", () => {
    const bare = byId.get("kestrel@2026-01-20")!;
    expect(bare.version).toBeUndefined();
    expect(bare.title).toBeUndefined();
    expect(bare.date).toBe("2026-01-20");
  });

  it("extracts all six categories from 2.4.0 with two breaking items in the rc", () => {
    const categories = byId.get("kestrel@2.4.0")!.changes.map((c) => c.category);
    expect(new Set(categories).size).toBe(6);
    expect(byId.get("kestrel@3.0.0-rc.1")!.changes.filter((c) => c.breaking)).toHaveLength(2);
  });

  it("falls back to canonical for the linkless 2.0.1 — never a fabricated fragment", () => {
    expect(byId.get("kestrel@2.0.1")!.url).toBe("https://kestrel.example/changelog");
  });

  it("detaches the security item's reference tail into structured references", () => {
    const security = byId.get("kestrel@2.4.0")!.changes.find((c) => c.category === "Security")!;
    expect(security.references).toContainEqual({
      kind: "cve",
      text: "CVE-2026-31882",
      url: "https://kestrel.example/security/CVE-2026-31882",
    });
    expect(security.text).toContain("Reported by @finch.");
  });

  it("attributes covered-version items in 2.3.0", () => {
    const fixed = byId.get("kestrel@2.3.0")!.changes.filter((c) => c.category === "Fixed");
    expect(fixed.map((c) => c.attributedTo)).toEqual([undefined, "2.3.1", "2.3.2"]);
    expect(fixed[1]!.text).toMatch(/^the installer no longer fails/);
  });

  it("platforms default from product.platforms", () => {
    expect(byId.get("kestrel@2.4.0")!.platforms).toEqual(["windows", "macos", "linux"]);
  });
});
