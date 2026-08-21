# declarative-changelog

Validator and reference parser for the [Declarative Changelogs standard](https://github.com/jwmixon/whatsnew-app/blob/main/docs/changelog-standard.md) — **v0.1, draft**. A declarative changelog is an ordinary `CHANGELOG.md` that a machine can ingest with no heuristics: YAML frontmatter, a deterministic release-heading grammar, Keep a Changelog's six categories, and a small YAML escape hatch per entry.

The spec is provisional; this tool tracks it. Every closed vocabulary (tags, categories, escape-hatch keys, frontmatter keys) lives in [`src/constants.ts`](src/constants.ts), so a spec revision is an edit to one file.

## Usage

```console
$ npx declarative-changelog validate CHANGELOG.md
CHANGELOG.md
  Level 2 — Categorized · 24 entries · addressable
  no problems
✔ no problems

$ npx declarative-changelog parse CHANGELOG.md
{ "changelog": "0.1", "product": { … }, "entries": [ … ] }
```

### `validate <file...|->`

Lints one or more documents against the spec and reports the computed conformance level — **Level 1 (Structured)**: the frontmatter parses under the YAML profile and declares a `changelog` version whose major this checker understands, every release-heading candidate parses, identifiers are unique, entries are newest first, and no entry's body is only a pointer elsewhere; **Level 2 (Categorized)**: Level 1 plus, in every entry, no top-level list outside a recognized `###` section. Addressability — whether every entry has its own URL — is reported alongside the level, along with the count of skipped headings.

| Flag | Effect |
| :-- | :-- |
| `--format pretty\|json` | Output format. The JSON schema is versioned (`schemaVersion`) for CI use |
| `--require-level 1\|2` | Exit non-zero unless every document reaches the level |
| `--max-warnings <n>` | Exit non-zero when more than `n` warnings are reported |
| `--follow-older` | Fetch the `document.older` archive chain so `superseded-by` can resolve across documents (network; off by default) |
| `--quiet` | Errors only |

Exit codes: `0` valid · `1` validation failed · `2` usage or internal error. Warnings do not fail the run unless `--max-warnings` says so.

### `parse <file|->`

Emits the consumer view — the spec's Field Mapping table as JSON: derived entry ids, version/title/date (the escape hatch wins over the heading), resolved URLs (`url:` → heading link → `document.canonical` → `product.homepage`, never a fabricated fragment), the summary blockquote, categorized changes with the reference-tail reduction applied — flattened text plus detached structured references (`issue` / `cve` / `link` / `credit`, with URLs where linked) and covered-version attributions — effective platforms, `yanked`/`routine`/`prerelease` flags, `covers` and `superseded-by`, and the skipped-heading counts. Absent beats guessed: what the publisher didn't state is omitted, never inferred.

Also available as a library:

```ts
import { parseChangelog, validateChangelog } from "declarative-changelog";
```

## Rules

Severity follows the spec's own language: MUST → error, SHOULD → warning, recommended → info.

**Errors** — `frontmatter/missing`, `frontmatter/changelog-required`, `frontmatter/invalid-yaml`, `frontmatter/profile` (anchors, aliases, tags, directives and multi-document streams are outside the YAML profile), `frontmatter/type`, `frontmatter/format`, `frontmatter/invalid-color`, `frontmatter/invalid-coverage`, `frontmatter/invalid-versioning`, `frontmatter/invalid-timestamp`, `frontmatter/invalid-locale`, `frontmatter/unknown-platform` (the platform value set is closed; consumers drop the value and keep the entry), `frontmatter/unknown-key` (the `product.` and `document.` key sets are closed), `frontmatter/older-required`, `frontmatter/id-required` (a name the slug algorithm reduces to nothing makes `product.id` required), `frontmatter/unsupported-version` (unknown major; a newer minor only warns), `heading/unknown-tag` (the run carries lifecycle only — `yanked`, `routine`; platforms and channels belong in the escape hatch; consumers drop the token and keep the release), `heading/candidate-does-not-parse` (a date-bearing `##` heading that fails the grammar, with the near-miss diagnosed where possible), `heading/invalid-date`, `order/not-newest-first`, `identity/duplicate-id`, `hatch/unknown-key`, `hatch/invalid-yaml`, `hatch/profile`, `hatch/misplaced`, `hatch/duplicate`, `hatch/invalid-version`, `hatch/invalid-date`, `hatch/prerelease-with-version` (an error whatever its value — the semver pre-release suffix is the signal), `relation/superseded-by-unresolved` (dangling in-document), `entry/link-only-body` (the content must be the notes, not a pointer to them), `entry/section-content` (a category section contains a list and nothing else), `entry/duplicate-section` (consumers merge in document order), `entry/routine-with-changes` (a release with categorized changes is not routine), `entry/attribution-not-covered` (a bold-version attribution must name a version from `covers`), `entry/empty-item`, `media/image-only-item`.

**Warnings** — `frontmatter/unknown-key` (top level only — static-site generator frontmatter is not this format's to police), `frontmatter/unsupported-version` (newer minor of major 0), `frontmatter/id-shape` (an explicit id should match `[a-z0-9][a-z0-9-]*`), `heading/duplicate-tag`, `heading/channel-as-prerelease` (`338.13-Stable` is, per the grammar, a pre-release named `Stable`), `document/multiple-titles`, `document/title-missing`, `entry/empty-section`, `entry/section-order` (canonical order is Added · Changed · Deprecated · Removed · Fixed · Security), `entry/summary-paragraphs`, `entry/breaking-near-miss` (`**BREAKING**`, `**Breaking:**`, `**Breaking change**` — the marker is exact), `hatch/contradicts-heading` (the hatch wins, but contradicting a heading that parses cleanly is a diverging document), `relation/yanked-without-superseded-by`, `relation/superseded-by-noise`, `relation/superseded-by-archive-only`, `relation/archive-unreachable`, `media/image-alt`, `media/raw-html`, `semver/breaking-needs-major`, `semver/added-needs-minor` (version/content agreement — gated on `product.versioning: semver`, only ever flagged, never derived; 0.x and pre-release finalizations are skipped).

**Info** — `heading/date-only`, `heading/skipped` (dateless headings are not candidates; suppressed for `## Unreleased`), `conformance/uncategorized-sections`, `document/no-entries`.

Keys beginning `x-` are permitted wherever keys appear and never validated. `relation/superseded-by-unresolved` downgrades to a warning when `document.older` exists but was not followed; `--follow-older` restores the strict check.

## Notes on interpretation

The spec is a draft; where it leaves room, this tool takes these positions:

- **Unpadded dates are treated as candidates.** The spec's candidate test is the `\d{4}-\d{2}-\d{2}` substring, but its own error examples include `## 2026-7-9` — the validator widens the test so the near-miss is diagnosed rather than silently skipped.
- **A trailing prose credit stays in the prose.** A bare `@handle` at the end of a sentence (`Reported by @finch.`) is not detached; a credit is tail when thanks-prefixed or comma-joined.
- **Link-only bodies** are flagged when an entry has no sections, no summary, and its whole body is one link or bare URL.
- **Version grammar is the spec's, not semver's** — `338.13` and `1.2.3.4` are versions; `1.0rc1` (PEP 440) is a title.
- **A date-only value means midnight UTC**, for ordering and for identity.

## Development

```console
npm test               # vitest — the spec's reference example is the primary fixture
npm run test:coverage  # v8 coverage: text summary + html + lcov in coverage/
npm run build          # tsc → dist/
npm run lint           # biome
```
