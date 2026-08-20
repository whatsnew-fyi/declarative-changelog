# declarative-changelog

Validator and reference parser for the [Declarative Changelogs standard](https://github.com/jwmixon/whatsnew-app/blob/main/docs/changelog-standard.md) — **v0.1, draft**. A declarative changelog is an ordinary `CHANGELOG.md` that a machine can ingest with no heuristics: YAML frontmatter, a deterministic release-heading grammar, Keep a Changelog's six categories, and a small YAML escape hatch per entry.

The spec is provisional; this tool tracks it. Every closed vocabulary (tags, categories, escape-hatch keys, frontmatter keys) lives in [`src/constants.ts`](src/constants.ts), so a spec revision is an edit to one file.

## Usage

```console
$ npx declarative-changelog validate CHANGELOG.md
CHANGELOG.md
  Level 2 — Categorized · 24 entries
  no problems
✔ no problems

$ npx declarative-changelog parse CHANGELOG.md
{ "changelog": "0.1", "product": { … }, "entries": [ … ] }
```

### `validate <file...|->`

Lints one or more documents against the spec and reports the computed conformance level — **Level 1 (Structured)**: valid frontmatter, every release heading matches the grammar; **Level 2 (Categorized)**: Level 1 plus every entry's changes under the six recognized `###` sections.

| Flag | Effect |
| :-- | :-- |
| `--format pretty\|json` | Output format. The JSON schema is versioned (`schemaVersion`) for CI use |
| `--require-level 1\|2` | Exit non-zero unless every document reaches the level |
| `--max-warnings <n>` | Exit non-zero when more than `n` warnings are reported |
| `--follow-older` | Fetch the `document.older` archive chain so `superseded-by` can resolve across documents (network; off by default) |
| `--quiet` | Errors only |

Exit codes: `0` valid · `1` validation failed · `2` usage or internal error. Warnings do not fail the run unless `--max-warnings` says so.

### `parse <file|->`

Emits the consumer view — the spec's Field Mapping table as JSON: derived entry ids, version/title/date, resolved URLs (heading link → `url:` → `document.canonical` + anchor → `product.homepage`), the first-blockquote summary, categorized changes with the reference-tail reduction applied, effective platforms, `yanked`/`routine`/`prerelease` flags, `covers` and `superseded-by`. Absent beats guessed: what the publisher didn't state is omitted, never inferred.

Also available as a library:

```ts
import { parseChangelog, validateChangelog } from "declarative-changelog";
```

## Rules

Severity follows the spec's own language: MUST → error, SHOULD → warning, recommended → info.

**Errors** — `frontmatter/missing`, `frontmatter/changelog-required`, `frontmatter/invalid-yaml`, `frontmatter/type`, `frontmatter/format`, `frontmatter/invalid-color`, `frontmatter/invalid-coverage`, `frontmatter/invalid-timestamp`, `frontmatter/invalid-locale`, `frontmatter/unknown-platform`, `frontmatter/older-required`, `heading/unknown-tag` (the tag vocabulary is closed — a channel belongs in the escape hatch), `heading/invalid-date`, `order/not-newest-first`, `identity/duplicate-id`, `hatch/unknown-key`, `hatch/invalid-yaml`, `hatch/misplaced`, `hatch/duplicate`, `hatch/invalid-version`, `hatch/invalid-date`, `hatch/prerelease-with-version` (a version's semver pre-release suffix is the signal; the flag is only for versionless releases), `relation/superseded-by-unresolved`, `entry/link-only-body` (the content must be the notes, not a pointer to them), `entry/section-content` (a category section contains a list and nothing else), `entry/empty-item`, `media/image-only-item`.

**Warnings** — `frontmatter/unknown-key`, `frontmatter/unsupported-version`, `heading/duplicate-tag`, `heading/skipped-release-like` (a `##` heading that looks like a release but doesn't parse — e.g. `## Release notes for 2026-05-02`), `document/multiple-titles`, `document/title-missing`, `entry/empty-section`, `entry/duplicate-section`, `entry/section-order` (canonical order is Added · Changed · Deprecated · Removed · Fixed · Security), `entry/summary-paragraphs`, `relation/yanked-without-superseded-by`, `relation/superseded-by-noise`, `relation/archive-unreachable`, `media/image-alt`, `media/raw-html`, `semver/breaking-needs-major`, `semver/added-needs-minor` (version/content agreement — only ever flagged, never derived; 0.x and pre-release finalizations are skipped).

**Info** — `heading/date-only`, `heading/offset-missing`, `heading/skipped` (suppressed for `## Unreleased`), `conformance/uncategorized-sections`, `document/no-entries`.

## Notes on interpretation

The spec is a draft; where it leaves room, this tool takes these positions:

- **`superseded-by` must name an entry** — a version that is only listed in another entry's `covers` does not resolve (the error says so specifically). With `document.older` present and unfollowed, the unresolved case downgrades to a warning; `--follow-older` restores the strict check.
- **`prerelease:` alongside a version is rejected outright**, as the spec's open question 2 suggests validators should.
- **Link-only bodies** are flagged when an entry has no sections, no summary, and its whole body is one link or bare URL.
- **Version grammar is the spec's, not semver's** — `338.13` and `1.2.3.4` are versions; `1.0rc1` (PEP 440) is a title.
- **A date-only value means midnight UTC**, for ordering and for identity.

## Development

```console
npm test          # vitest — the spec's reference example is the primary fixture
npm run build     # tsc → dist/
npm run lint      # biome
```
