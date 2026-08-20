import { describe, expect, it } from "vitest";
import type { ConsumerChange } from "../src/index.js";
import { parse } from "./helpers.js";

function reduce(item: string): ConsumerChange {
  const view = parse(`## 2.4.0 — 2026-07-09\n\n### Fixed\n\n- ${item}`);
  return view.entries[0]!.changes[0]!;
}

describe("change item reduction", () => {
  it("detaches the spec's worked example tail into structured references", () => {
    const r = reduce(
      "Tasks with no declared dependency on each other now run in parallel. ([#1204](https://github.com/corvid/kestrel/issues/1204), thanks @wren)",
    );
    expect(r.text).toBe("Tasks with no declared dependency on each other now run in parallel.");
    expect(r.references).toEqual([
      { kind: "issue", text: "#1204", url: "https://github.com/corvid/kestrel/issues/1204" },
      { kind: "credit", text: "@wren" },
    ]);
  });

  it("detaches bare #-prefixed references and comma-joined credits", () => {
    const r = reduce("Fixed the watcher. #1204, #88");
    expect(r.text).toBe("Fixed the watcher.");
    expect(r.references).toEqual([
      { kind: "issue", text: "#1204" },
      { kind: "issue", text: "#88" },
    ]);
    expect(reduce("Fixed the watcher, thanks to @wren").text).toBe("Fixed the watcher");
  });

  it("keeps bare tracker keys in the prose — only the #-prefixed form counts outside a group", () => {
    expect(reduce("Fixed the watcher. GH-1204").text).toBe("Fixed the watcher. GH-1204");
    expect(reduce("Now speaks HTTP-2").text).toBe("Now speaks HTTP-2");
  });

  it("detaches a trailing link whose text is a reference", () => {
    const r = reduce("Digest checks are strict. [CVE-2026-31882](https://x.example/cve)");
    expect(r.text).toBe("Digest checks are strict.");
    expect(r.references).toEqual([
      { kind: "cve", text: "CVE-2026-31882", url: "https://x.example/cve" },
    ]);
    const tracker = reduce("Resolver rewritten. [KES-88](https://x.example/kes-88)");
    expect(tracker.references).toEqual([
      { kind: "issue", text: "KES-88", url: "https://x.example/kes-88" },
    ]);
  });

  it("keeps a bare @handle that is part of the prose", () => {
    expect(reduce("Manifests over plain HTTP are rejected. Reported by @finch.").text).toBe(
      "Manifests over plain HTTP are rejected. Reported by @finch.",
    );
  });

  it("detaches a trailing all-link parenthesized group", () => {
    const cve = reduce("Digests are verified. ([CVE-2026-31882](https://x.example/cve))");
    expect(cve.text).toBe("Digests are verified.");
    expect(cve.references).toEqual([
      { kind: "cve", text: "CVE-2026-31882", url: "https://x.example/cve" },
    ]);
    // conventional-changelog's writer emits `([abc1234](commit-url))` — kind `link`.
    const commit = reduce("Faster resolver. ([abc1234](https://x.example/commit))");
    expect(commit.text).toBe("Faster resolver.");
    expect(commit.references).toEqual([
      { kind: "link", text: "abc1234", url: "https://x.example/commit" },
    ]);
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

  it("the marker is exact — variants are near-misses, not markers", () => {
    expect(reduce("**BREAKING** — gone.").breaking).toBe(false);
    expect(reduce("**Breaking:** gone.").breaking).toBe(false);
    expect(reduce("**Breaking change** — gone.").breaking).toBe(false);
    expect(reduce("**Breaking** without a separator.").breaking).toBe(false);
  });

  it("does not mark ordinary items breaking", () => {
    expect(reduce("The **latest** build is faster.").breaking).toBe(false);
  });

  it("reads the covered-version attribution marker, composed with Breaking", () => {
    const attributed = reduce("**2.3.1** — the installer no longer fails.");
    expect(attributed.attributedTo).toBe("2.3.1");
    expect(attributed.text).toBe("the installer no longer fails.");
    const both = reduce("**2.3.2** — **Breaking** — the flag is gone.");
    expect(both.attributedTo).toBe("2.3.2");
    expect(both.breaking).toBe(true);
    expect(both.text).toBe("the flag is gone.");
  });

  it("a bold version without a separator is prose, not an attribution", () => {
    const r = reduce("**2.0** is now the minimum supported version.");
    expect(r.attributedTo).toBeUndefined();
    expect(r.text).toBe("2.0 is now the minimum supported version.");
  });
});
