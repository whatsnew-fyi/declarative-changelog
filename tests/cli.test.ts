import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadArchiveChain } from "../src/index.js";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function run(args: string[], input?: string): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      ...(input === undefined ? {} : { input }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, code: 0 };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { stdout: e.stdout ?? "", code: e.status };
  }
}

describe("cli", () => {
  it("validates the reference example with exit 0", () => {
    const { stdout, code } = run(["validate", fixture("valid/kestrel.md")]);
    expect(code).toBe(0);
    expect(stdout).toContain("Level 1 — Structured");
    expect(stdout).toContain("10 entries");
  });

  it("fails on a tag typo with exit 1 and the rule id", () => {
    const { stdout, code } = run(["validate", fixture("invalid/tag-typo.md")]);
    expect(code).toBe(1);
    expect(stdout).toContain("heading/unknown-tag");
    expect(stdout).toContain("lst");
  });

  it("emits machine-readable JSON", () => {
    const { stdout, code } = run(["validate", "--format", "json", fixture("invalid/tag-typo.md")]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.schemaVersion).toBe(1);
    expect(report.summary.error).toBeGreaterThan(0);
    expect(
      report.files[0].diagnostics.some((d: { rule: string }) => d.rule === "heading/unknown-tag"),
    ).toBe(true);
  });

  it("enforces --require-level 2", () => {
    const { code } = run(["validate", "--require-level", "2", fixture("valid/kestrel.md")]);
    expect(code).toBe(1); // the example deliberately tops out at Level 1
  });

  it("parses to the consumer view", () => {
    const { stdout, code } = run(["parse", fixture("valid/kestrel.md")]);
    expect(code).toBe(0);
    const view = JSON.parse(stdout);
    expect(view.changelog).toBe("0.1");
    expect(view.entries).toHaveLength(10);
  });

  it("rejects unknown commands with exit 2", () => {
    expect(run(["frobnicate"]).code).toBe(2);
  });
});

describe("loadArchiveChain", () => {
  const archiveDoc = `---
changelog: "0.1"
product:
  name: Kestrel
document:
  coverage: complete
---

# Kestrel 1.x changelog

## 1.9.0 — 2025-11-02

Final 1.x release.
`;

  it("collects versions and ids from the chain", async () => {
    const fetchImpl = (async () => new Response(archiveDoc, { status: 200 })) as typeof fetch;
    const archive = await loadArchiveChain("https://x.example/1.x.md", 5, fetchImpl);
    expect(archive.versions.has("1.9.0")).toBe(true);
    expect(archive.ids.has("kestrel@1.9.0")).toBe(true);
    expect(archive.failures).toHaveLength(0);
  });

  it("records failures instead of throwing", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const archive = await loadArchiveChain("https://x.example/gone.md", 5, fetchImpl);
    expect(archive.failures).toHaveLength(1);
  });

  it("writes GitHub annotations with --format github", () => {
    const { stdout, code } = run([
      "validate",
      "--format",
      "github",
      fixture("invalid/tag-typo.md"),
    ]);
    expect(code).toBe(1);
    expect(stdout).toMatch(
      /^::error file=.*tag-typo\.md,line=\d+,col=\d+.*title=heading\/unknown-tag::/m,
    );
  });

  it("normalizes stdin to stdout, and --check fails on a file that needs it", () => {
    const source = `---\nchangelog: "0.1"\nproduct:\n  name: Kestrel\n---\n\n# Kestrel\n\n## 1.3.0 (2026-10-14)\n\n### Bug Fixes\n\n* a fix\n`;
    const out = run(["normalize", "-"], source);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("## 1.3.0 - 2026-10-14\n\n### Fixed\n\n- a fix\n");
    expect(run(["normalize", "--check", "-"], source).code).toBe(1);
    expect(run(["normalize", "--check", "-"], out.stdout).code).toBe(0);
    expect(run(["normalize", "--date", "soon", "-"], source).code).toBe(2);
  });

  it("normalizes several files in place, as a monorepo's packages need", () => {
    const dir = mkdtempSync(join(tmpdir(), "dc-normalize-"));
    const needs = `---\nchangelog: "0.1"\n---\n\n# A\n\n## 1.3.0 (2026-10-14)\n\n### Bug Fixes\n\n* a fix\n`;
    const fine = `---\nchangelog: "0.1"\n---\n\n# B\n\n## 1.0.0 - 2026-10-14\n\n### Fixed\n\n- a fix\n`;
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, needs);
    writeFileSync(b, fine);
    try {
      expect(run(["normalize", a, b]).code).toBe(2);
      expect(run(["normalize", "--check", a, b]).code).toBe(1);
      const out = run(["normalize", "--write", a, b]);
      expect(out.code).toBe(0);
      expect(out.stdout).toContain(`${b}: already normal`);
      expect(readFileSync(a, "utf8")).toContain("## 1.3.0 - 2026-10-14\n\n### Fixed\n");
      expect(readFileSync(b, "utf8")).toBe(fine);
      expect(run(["normalize", "--check", a, b]).code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("extracts the latest entry's notes", () => {
    const { stdout, code } = run(["extract", fixture("valid/kestrel.md")]);
    expect(code).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    expect(stdout).not.toMatch(/^## /m);
    expect(run(["extract", fixture("valid/kestrel.md"), "99.0.0"]).code).toBe(1);
  });
});
