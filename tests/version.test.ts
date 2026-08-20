import { describe, expect, it } from "vitest";
import { bumpKind, compareVersions, parseVersion } from "../src/parse/version.js";

describe("version grammar", () => {
  it.each(["2.4.0", "v2.4.0", "2.4.0-rc.1", "2.4.0+build.7", "338.13", "1.2.3.4", "1.0.0-a1"])(
    "accepts %s",
    (token) => {
      expect(parseVersion(token)).toBeDefined();
    },
  );

  // PEP 440 spellings are not semver: read as titles, not versions.
  it.each([
    "1.0a1",
    "1.0rc1",
    "2",
    "v2",
    "2.4.0 Stable",
    "338.13 - Stable",
    "Parallel task graphs",
  ])("rejects %s", (token) => {
    expect(parseVersion(token)).toBeUndefined();
  });

  it("parses the parts", () => {
    const v = parseVersion("v2.4.0-rc.1+build.7")!;
    expect(v.numbers).toEqual([2, 4, 0]);
    expect(v.prerelease).toBe("rc.1");
    expect(v.build).toBe("build.7");
  });
});

describe("version comparison", () => {
  const cmp = (a: string, b: string) =>
    Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!));

  it("orders numeric segments", () => {
    expect(cmp("2.4.0", "2.3.9")).toBe(1);
    expect(cmp("2.4", "2.4.0")).toBe(0);
    expect(cmp("338.13", "338.2")).toBe(1);
  });

  it("a release outranks its pre-releases", () => {
    expect(cmp("2.5.0", "2.5.0-rc.1")).toBe(1);
    expect(cmp("2.5.0-rc.1", "2.5.0-beta.2")).toBe(1);
    expect(cmp("2.5.0-rc.1", "2.5.0-rc.2")).toBe(-1);
    expect(cmp("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(cmp("1.0.0-1", "1.0.0-alpha")).toBe(-1); // numeric below alphanumeric
  });

  it("ignores build metadata", () => {
    expect(cmp("2.4.0+build.7", "2.4.0+build.9")).toBe(0);
  });
});

describe("bumpKind", () => {
  const bump = (a: string, b: string) => bumpKind(parseVersion(a)!, parseVersion(b)!);
  it("classifies bumps", () => {
    expect(bump("2.4.1", "3.0.0-rc.1")).toBe("major");
    expect(bump("2.3.0", "2.4.0")).toBe("minor");
    expect(bump("2.4.0", "2.4.1")).toBe("patch");
    expect(bump("2.5.0-rc.1", "2.5.0")).toBe("none");
    expect(bump("2.4.0", "2.4.0")).toBeUndefined();
    expect(bump("2.4.0", "2.3.0")).toBeUndefined();
  });
});
