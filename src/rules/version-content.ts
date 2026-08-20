import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel, ReleaseEntry } from "../parse/document.js";
import { bumpKind, compareVersions } from "../parse/version.js";

/**
 * Version and content should agree (spec §Version and content should agree):
 * a Breaking item wants at least a major bump, Added items at least a minor.
 * Only ever flags the disagreement — a consumer must never derive a version.
 */
export function checkVersionContent(model: ChangelogModel): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const [index, entry] of model.entries.entries()) {
    const version = entry.version;
    if (!version) continue;
    if ((version.numbers[0] ?? 0) === 0) continue; // 0.x has its own semver rules

    const prev = findPredecessor(model.entries, index, entry);
    if (!prev?.version) continue;
    if (compareVersions(version, prev.version) <= 0) continue; // ordering rule's problem

    // Finalizing a pre-release (2.5.0 after 2.5.0-rc.1) is not a bump.
    if (
      prev.version.prerelease !== undefined &&
      sameNumbers(prev.version.numbers, version.numbers)
    ) {
      continue;
    }

    const bump = bumpKind(prev.version, version);
    const hasBreaking = entry.sections.some((s) => s.items.some((i) => i.breaking));
    const hasAdded = entry.sections.some((s) => s.category === "Added" && s.items.length > 0);

    if (hasBreaking && bump !== "major") {
      out.push({
        rule: "semver/breaking-needs-major",
        severity: "warning",
        message: `Entry contains a **Breaking** change but \`${version.raw}\` is only a ${bump} bump over \`${prev.version.raw}\` — a breaking change should be at least a major bump`,
        position: entry.position,
      });
    } else if (hasAdded && (bump === "patch" || bump === "none")) {
      out.push({
        rule: "semver/added-needs-minor",
        severity: "warning",
        message: `Entry has \`### Added\` items but \`${version.raw}\` is only a ${bump} bump over \`${prev.version.raw}\` — additions should be at least a minor bump`,
        position: entry.position,
      });
    }
  }

  return out;
}

function findPredecessor(
  entries: readonly ReleaseEntry[],
  index: number,
  entry: ReleaseEntry,
): ReleaseEntry | undefined {
  for (let i = index + 1; i < entries.length; i++) {
    const candidate = entries[i]!;
    if (!candidate.version) continue;
    if (candidate.channel !== entry.channel) continue;
    return candidate;
  }
  return undefined;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}
