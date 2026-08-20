import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadArchiveChain } from "../src/index.js";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function run(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
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
});
