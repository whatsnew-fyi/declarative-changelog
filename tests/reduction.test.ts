import { describe, expect, it } from "vitest";
import { parse } from "./helpers.js";

function reduce(item: string): { text: string; breaking: boolean } {
  const view = parse(`## 2.4.0 — 2026-07-09\n\n### Fixed\n\n- ${item}`);
  const change = view.entries[0]!.changes[0]!;
  return { text: change.text, breaking: change.breaking };
}

describe("change item text reduction", () => {
  it("strips the spec's worked example tail", () => {
    expect(
      reduce(
        "Tasks with no declared dependency on each other now run in parallel. ([#1204](https://github.com/corvid/kestrel/issues/1204), thanks @wren)",
      ).text,
    ).toBe("Tasks with no declared dependency on each other now run in parallel.");
  });

  it("strips bare issue references and comma-joined credits", () => {
    expect(reduce("Fixed the watcher. #1204, GH-88, KES-12").text).toBe("Fixed the watcher.");
    expect(reduce("Fixed the watcher, thanks to @wren").text).toBe("Fixed the watcher");
  });

  it("keeps a bare @handle that is part of the prose", () => {
    expect(reduce("Manifests over plain HTTP are rejected. Reported by @finch.").text).toBe(
      "Manifests over plain HTTP are rejected. Reported by @finch.",
    );
  });

  it("strips a trailing all-link parenthesized group", () => {
    expect(reduce("Digests are verified. ([CVE-2026-31882](https://x.example/cve))").text).toBe(
      "Digests are verified.",
    );
    expect(reduce("Faster resolver. ([abc1234](https://x.example/commit))").text).toBe(
      "Faster resolver.",
    );
  });

  it("keeps parentheses that are prose", () => {
    expect(reduce("Startup fell from nine seconds to under one (on Linux).").text).toBe(
      "Startup fell from nine seconds to under one (on Linux).",
    );
  });

  it("flattens inline markup", () => {
    expect(
      reduce("`kestrel watch` no longer misses **edits** to [symlinked](https://x.example) files.")
        .text,
    ).toBe("kestrel watch no longer misses edits to symlinked files.");
  });

  it("takes only the first paragraph", () => {
    expect(reduce("The change.\n\n  More detail that is not the change.").text).toBe("The change.");
  });

  it("detects and strips the Breaking marker", () => {
    const r = reduce("**Breaking** — the `--serial` flag has been removed; use `--jobs 1`.");
    expect(r.breaking).toBe(true);
    expect(r.text).toBe("the --serial flag has been removed; use --jobs 1.");
  });

  it("does not mark ordinary items breaking", () => {
    expect(reduce("The **latest** build is faster.").breaking).toBe(false);
  });
});
