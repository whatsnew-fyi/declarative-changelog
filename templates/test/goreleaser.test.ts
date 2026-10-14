import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractEntry } from "../../src/extract.js";

/**
 * GoReleaser reads notes rather than writing a changelog, so its template is
 * the `extract` step: the entry for the tag being released, from a file one
 * of the other templates wrote.
 */
const changelog = readFileSync(new URL("./golden/git-cliff.md", import.meta.url), "utf8");

describe("goreleaser", () => {
  it("hands over the entry for the tag, with or without its v", async () => {
    const notes = extractEntry(changelog, "v2.0.0");
    expect(notes?.version).toBe("2.0.0");
    expect(extractEntry(changelog, "2.0.0")).toEqual(notes);
    await expect(`${notes?.markdown}\n`).toMatchFileSnapshot("golden/goreleaser-notes.md");
  });

  it("finds nothing for a tag the changelog has no entry for", () => {
    expect(extractEntry(changelog, "v9.9.9")).toBeUndefined();
  });
});
