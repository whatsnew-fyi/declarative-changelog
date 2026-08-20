/**
 * The spec's version grammar. Deliberately NOT semver:
 *
 *   version := "v"? DIGIT+ ("." DIGIT+)+ ("-" pre)? ("+" build)?
 *
 * Two-part (`338.13`) and four-part (`1.2.3.4`) versions are valid; a bare
 * `2` is not. Pre-release and build identifier charsets follow semver.
 */

export interface Version {
  /** The token as written, including any leading `v`. */
  raw: string;
  numbers: number[];
  prerelease?: string;
  build?: string;
}

const VERSION_RE =
  /^v?(\d+(?:\.\d+)+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(token: string): Version | undefined {
  const m = VERSION_RE.exec(token);
  if (!m) return undefined;
  const version: Version = {
    raw: token,
    numbers: m[1]!.split(".").map(Number),
  };
  if (m[2] !== undefined) version.prerelease = m[2];
  if (m[3] !== undefined) version.build = m[3];
  return version;
}

/**
 * Semver §11 precedence, generalized to any number of numeric segments.
 * Build metadata is ignored. Returns negative/zero/positive.
 */
export function compareVersions(a: Version, b: Version): number {
  const len = Math.max(a.numbers.length, b.numbers.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.numbers[i] ?? 0) - (b.numbers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1; // a release outranks any of its pre-releases
  if (b === undefined) return -1;
  const as = a.split(".");
  const bs = b.split(".");
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const ai = as[i];
    const bi = bs[i];
    if (ai === undefined) return -1; // shorter set of identifiers ranks lower
    if (bi === undefined) return 1;
    const an = /^\d+$/.test(ai);
    const bn = /^\d+$/.test(bi);
    if (an && bn) {
      const diff = Number(ai) - Number(bi);
      if (diff !== 0) return diff;
    } else if (an !== bn) {
      return an ? -1 : 1; // numeric identifiers rank below alphanumeric
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

export type Bump = "major" | "minor" | "patch" | "none";

/**
 * What kind of bump `next` is relative to `prev`, read over the first three
 * numeric segments. Returns undefined when `next` is not greater than `prev`.
 */
export function bumpKind(prev: Version, next: Version): Bump | undefined {
  if (compareVersions(next, prev) <= 0) return undefined;
  const p = (v: Version, i: number) => v.numbers[i] ?? 0;
  if (p(next, 0) > p(prev, 0)) return "major";
  if (p(next, 1) > p(prev, 1)) return "minor";
  if (p(next, 2) > p(prev, 2)) return "patch";
  return "none"; // deeper segment or pre-release-only difference
}
