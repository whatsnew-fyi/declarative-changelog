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

  it("skips Unreleased and the annotation section without flagging them as release-like", () => {
    expect(result.model.skipped).toHaveLength(2);
    expect(result.model.skipped.every((s) => !s.smellsLikeRelease)).toBe(true);
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

  it("falls back to canonical + anchor for the linkless 2.0.1", () => {
    expect(byId.get("kestrel@2.0.1")!.url).toBe(
      "https://kestrel.example/changelog#201--2026-02-14",
    );
  });

  it("platforms default from product.platforms", () => {
    expect(byId.get("kestrel@2.4.0")!.platforms).toEqual(["windows", "macos", "linux"]);
  });
});
