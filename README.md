# declarative-changelog

[![npm](https://img.shields.io/npm/v/declarative-changelog)](https://www.npmjs.com/package/declarative-changelog)
[![CI](https://github.com/whatsnew-fyi/declarative-changelog/actions/workflows/ci.yml/badge.svg)](https://github.com/whatsnew-fyi/declarative-changelog/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/declarative-changelog)](https://www.npmjs.com/package/declarative-changelog)
[![license](https://img.shields.io/npm/l/declarative-changelog)](./LICENSE)

Validator and reference parser for the [Declarative Changelogs standard](https://whatsnew.fyi/spec) — **v0.1, draft**.

A declarative changelog is an ordinary `CHANGELOG.md` that a machine can ingest with **no heuristics, no extraction, and no language model**: YAML frontmatter, a deterministic release-heading grammar, [Keep a Changelog](https://keepachangelog.com)'s six categories, and a small YAML escape hatch per entry. Every fact a consumer would otherwise infer, the publisher declares — and the document still reads as a normal changelog on GitHub, on npm, and in any Markdown viewer.

This tool is both sides of that contract:

- **`validate`** is the loud authoring-time check — an editor plugin, a pre-commit hook, CI. Its job is to kill the typo while the publisher is still looking at the file.
- **`parse`** is the reference consumer — it emits the spec's Field Mapping table as JSON, salvage-oriented and deterministic.
- **`normalize`** repairs what release-please and changesets write, so a project keeps its release tool and still publishes a conforming file.
- **`extract`** prints one entry's notes, for a GitHub release body or goreleaser's `--release-notes`.

The spec is provisional; this tool tracks it. Every closed vocabulary (tags, categories, escape-hatch keys, frontmatter keys) lives in [`src/constants.ts`](src/constants.ts), so a spec revision is an edit to one file.

## What a document looks like

````markdown
---
changelog: "0.1"
product:
  name: Kestrel
  homepage: https://kestrel.example
document:
  updated: 2026-07-28T14:02:00Z
  coverage: complete
---

# Kestrel changelog

## [3.1.0](https://kestrel.example/releases/3.1.0) — 2026-07-28T14:00:00Z

> Remote cache backends and a faster scheduler.

### Added

- Task outputs can be pushed to any S3-compatible bucket.

### Fixed

- The scheduler no longer stalls on cyclic `dependsOn` graphs.
````

## Install

```console
npm install --save-dev declarative-changelog   # project devDependency
npx declarative-changelog validate CHANGELOG.md   # or run it directly
```

Requires Node.js ≥ 20. No configuration files; the document declares its own spec version.

## Quick start

```console
$ npx declarative-changelog validate CHANGELOG.md
CHANGELOG.md
  Level 2 — Categorized · 1 entry · addressable
  no problems

✔ no problems
```

When something is wrong, the diagnostic names the rule, points at the line, and says what a consumer will do with the damage:

```console
$ npx declarative-changelog validate CHANGELOG.md
CHANGELOG.md
  Level 2 — Categorized · 1 entry · 0/1 addressable
  9:1      error   Unknown tag `lst` — the vocabulary is closed: yanked, routine. A channel belongs in the escape hatch (`channel:`); a consumer drops the token and keeps the release  heading/unknown-tag

✖ 1 error
```

And `parse` turns the document into the consumer view:

```console
$ npx declarative-changelog parse CHANGELOG.md
{
  "product": { "name": "Kestrel", "homepage": "https://kestrel.example", "id": "kestrel" },
  "entries": [
    {
      "id": "kestrel@3.1.0",
      "version": "3.1.0",
      "date": "2026-07-28T14:00:00Z",
      "url": "https://kestrel.example/releases/3.1.0",
      "summary": "Remote cache backends and a faster scheduler.",
      "changes": [
        { "category": "Added", "text": "Task outputs can be pushed to any S3-compatible bucket.", … },
        { "category": "Fixed", "text": "The scheduler no longer stalls on cyclic dependsOn graphs.", … }
      ],
      "level": 2
    }
  ],
  …
}
```

## CLI

### `validate <file...|->`

Lints one or more documents (or stdin) against the spec and reports the computed conformance level:

- **Level 1 — Structured**: the frontmatter parses under the YAML profile and declares a `changelog` version whose major this checker understands, every release-heading candidate parses, identifiers are unique, entries are newest first, and no entry's body is only a pointer elsewhere.
- **Level 2 — Categorized**: Level 1 plus, in every entry, no top-level list outside a recognized `###` section.

Addressability — whether every entry has its own URL — is reported alongside the level, along with the count of skipped headings.

| Flag | Effect |
| :-- | :-- |
| `--format pretty\|json\|github` | Output format. The JSON schema is versioned (`schemaVersion`) for CI use; `github` writes workflow annotations that GitHub pins to the line in a PR |
| `--require-level 1\|2` | Exit non-zero unless every document reaches the level |
| `--max-warnings <n>` | Exit non-zero when more than `n` warnings are reported |
| `--follow-older` | Fetch the `document.older` archive chain so `superseded-by` can resolve across documents (network; off by default) |
| `--quiet` | Errors only |

Exit codes: `0` valid · `1` validation failed · `2` usage or internal error. Warnings do not fail the run unless `--max-warnings` says so.

A typical CI gate:

```console
npx declarative-changelog validate CHANGELOG.md --require-level 2 --max-warnings 0
```

### `parse <file|->`

Emits the consumer view — the spec's Field Mapping table as JSON: derived entry ids, version/title/date (the escape hatch wins over the heading), resolved URLs (`url:` → heading link → `document.canonical` → `product.homepage`, never a fabricated fragment), the summary blockquote, categorized changes with the reference-tail reduction applied — flattened text plus detached structured references (`issue` / `cve` / `link` / `credit`, with URLs where linked) and covered-version attributions — effective platforms, `yanked`/`routine`/`prerelease` flags, `covers` and `superseded-by`, and the skipped-heading counts.

**Absent beats guessed**: what the publisher didn't state is omitted, never inferred.

| Flag | Effect |
| :-- | :-- |
| `--compact` | Single-line JSON (default: pretty-printed) |

### `normalize <file|->`

Repairs a changelog after a release tool has written to it, and prints the result (or rewrites the file with `--write`). Only the **new** entries are touched, meaning the ones above the newest entry that already conforms, so history stays byte for byte:

- `## [1.3.0](compare) (2026-10-14)`, release-please's heading, becomes `## [1.3.0](compare) - 2026-10-14`.
- An undated `## 1.3.0`, which changesets writes and every consumer skips, gets `--date` (default: now, UTC, to the second).
- Items under `### ⚠ BREAKING CHANGES` get the `**Breaking** — ` marker on their twin in the category they belong to, or move to `### Changed` when they have none.
- Tool section names become categories: Features → Added, Bug Fixes → Fixed, Performance Improvements and Reverts → Changed, and changesets' Major/Minor/Patch Changes → Changed with the Breaking marker, Added and Fixed. Any other section is left where it is.
- Sections are merged and put in canonical order.
- A frontmatter block a tool pushed down the file, or wrote an entry into, goes back to the top, and `document.updated` moves forward to the newest date.

| Flag | Effect |
| :-- | :-- |
| `--write` | Rewrite the file in place |
| `--check` | Exit `1` when the file needs normalizing, and change nothing |
| `--date <rfc3339>` | The date for new undated entries |
| `--all` | Repair headings and sections in every entry, for a first run on an existing file. Old entries are never dated |
| `--keep-sections` | Leave changesets' Major/Minor/Patch Changes sections as they are |

Run it right after the tool, then validate:

```console
npx changeset version && npx declarative-changelog normalize --write CHANGELOG.md
npx declarative-changelog validate CHANGELOG.md --require-level 2
```

### `extract <file|-> [version|latest]`

Prints one entry's notes as markdown: the entry as written, without its heading, its escape hatch or the file's link definitions. `latest` (the default) is the newest entry that is not yanked; a version matches with or without its `v`. Exit `1` when there is no such entry.

```console
npx declarative-changelog extract CHANGELOG.md > notes.md
goreleaser release --release-notes notes.md
```

## In CI and pre-commit

The repository is also a GitHub Action. It validates, annotates each problem on the PR, and can ask [What's New](https://whatsnew.fyi) to read the changelog now instead of on its next poll:

```yaml
- uses: whatsnew-fyi/declarative-changelog@v0
  with:
    files: CHANGELOG.md   # default
    require-level: 2      # default
    max-warnings: 0
```

To ping after a deploy, pass the URL the changelog is served at. A URL What's New does not track yet is a warning with a link to suggest it, never a failure:

```yaml
- uses: whatsnew-fyi/declarative-changelog@v0
  with:
    ping-url: https://example.com/.well-known/changelog.md
```

The action runs the CLI version its tag names (`v0` runs the newest 0.x) through `npx`; `version:` pins another (0.3.0 or later).

For [pre-commit](https://pre-commit.com):

```yaml
- repo: https://github.com/whatsnew-fyi/declarative-changelog
  rev: v0.3.0
  hooks:
    - id: declarative-changelog
```

The hook runs the published CLI at the tag's version through `npx`, so it needs Node.js 20 or later and builds nothing.

## Library

The same two operations, plus the archive-chain loader, with full TypeScript types:

```ts
import { parseChangelog, validateChangelog, loadArchiveChain } from "declarative-changelog";

const result = validateChangelog(source, "CHANGELOG.md");
result.level;          // 0 | 1 | 2
result.diagnostics;    // [{ rule, severity, message, position? }, …]

const view = parseChangelog(source);
view.entries[0]?.id;   // "kestrel@3.1.0"
```

`validateChangelog` and `parseChangelog` are pure and synchronous; network access happens only in `loadArchiveChain`, and only when you call it.

`normalizeChangelog(source, options)` returns `{ output, changes }`, and `extractEntry(source, "latest")` returns `{ heading, version, markdown }`, both pure as well.

## Rules

Severity follows the spec's own language: **MUST → error**, **SHOULD → warning**, **recommended → info**. Keys beginning `x-` are permitted wherever keys appear and never validated.

### Errors

| Rule | What it catches |
| :-- | :-- |
| `frontmatter/missing` | No YAML frontmatter block |
| `frontmatter/changelog-required` | No `changelog` version declaration |
| `frontmatter/invalid-yaml` | Frontmatter does not parse |
| `frontmatter/profile` | Anchors, aliases, tags, directives, or multi-document streams — outside the YAML profile |
| `frontmatter/type` | A value of the wrong type |
| `frontmatter/format` | A URL-valued key whose value is not a valid URL |
| `frontmatter/invalid-color` | `product.color` is not six hex digits (a leading `#` is tolerated), or is empty because an unquoted `#` started a YAML comment |
| `frontmatter/invalid-coverage` | `document.coverage` is not `complete` or `partial` |
| `frontmatter/invalid-versioning` | `product.versioning` is not `semver`, `calver`, or `none` |
| `frontmatter/invalid-timestamp` | `document.updated` is not an RFC 3339 timestamp |
| `frontmatter/invalid-locale` | `document.locale` is not a BCP 47 tag |
| `frontmatter/unknown-platform` | The platform value set is closed; consumers drop the value and keep the entry |
| `frontmatter/unknown-key` | The `product.` and `document.` key sets are closed |
| `frontmatter/older-required` | `coverage: partial` without `document.older` |
| `frontmatter/id-required` | A name the slug algorithm reduces to nothing makes `product.id` required |
| `frontmatter/unsupported-version` | Unknown `changelog` major (a newer minor only warns) |
| `heading/unknown-tag` | The run carries lifecycle only — `yanked`, `routine`; platforms and channels belong in the escape hatch; consumers drop the token and keep the release |
| `heading/candidate-does-not-parse` | A date-bearing `##` heading that fails the grammar, with the near-miss diagnosed where possible |
| `heading/invalid-date` | A date that matches the shape but not the calendar |
| `order/not-newest-first` | Entries out of reverse-chronological order |
| `identity/duplicate-id` | Two entries derive the same id |
| `hatch/unknown-key` | The escape-hatch key set is closed |
| `hatch/invalid-yaml` | The hatch block does not parse |
| `hatch/profile` | YAML outside the profile, in the hatch |
| `hatch/misplaced` | A hatch block anywhere but immediately after its `##` heading, before the summary |
| `hatch/duplicate` | Two hatch blocks under one heading |
| `hatch/invalid-version` | `version:` fails the version grammar |
| `hatch/invalid-date` | `date:` fails the timestamp grammar |
| `hatch/prerelease-with-version` | `prerelease:` on a versioned release — an error whatever its value; the semver pre-release suffix is the signal |
| `relation/superseded-by-unresolved` | Dangling in-document reference (downgrades to a warning when `document.older` exists but was not followed; `--follow-older` restores the strict check) |
| `entry/link-only-body` | The content must be the notes, not a pointer to them |
| `entry/section-content` | A category section must contain a list and nothing else |
| `entry/duplicate-section` | Same category twice; consumers merge in document order |
| `entry/routine-with-changes` | A release with categorized changes is not routine |
| `entry/attribution-not-covered` | A bold-version attribution must name a version from `covers` |
| `entry/empty-item` | A list item with no content |
| `media/image-only-item` | A change item that is only an image — an entry has to be comprehensible with every image removed |

### Warnings

| Rule | What it catches |
| :-- | :-- |
| `frontmatter/unknown-key` | Top level only — static-site generator frontmatter is not this format's to police |
| `frontmatter/unsupported-version` | A newer minor of a known major |
| `frontmatter/id-shape` | An explicit id should match `[a-z0-9][a-z0-9-]*` |
| `heading/duplicate-tag` | The same tag twice in one run |
| `heading/channel-as-prerelease` | `338.13-Stable` is, per the grammar, a pre-release named `Stable` |
| `heading/bracketed-label` | `## [1.2.3] - date` with no `[1.2.3]: url` definition: CommonMark leaves the brackets as text, so the release has a title and no version |
| `document/multiple-titles` | More than one `#` title |
| `document/title-missing` | No `#` title |
| `entry/empty-section` | A category heading with no items |
| `entry/section-order` | Canonical order is Added · Changed · Deprecated · Removed · Fixed · Security |
| `entry/summary-paragraphs` | A summary blockquote of more than one paragraph |
| `entry/breaking-near-miss` | `**BREAKING**`, `**Breaking:**`, `**Breaking change**` — the marker is exact |
| `hatch/contradicts-heading` | The hatch wins, but contradicting a heading that parses cleanly is a diverging document |
| `relation/yanked-without-superseded-by` | A yanked release should say what replaces it |
| `relation/superseded-by-noise` | `superseded-by` names the chronologically next release on an ordinary entry — it carries no information |
| `relation/superseded-by-archive-only` | Resolves only through the archive chain |
| `relation/archive-unreachable` | An archive document could not be fetched |
| `media/image-alt` | An image without meaningful alt text — consumers routinely render images as their alt text alone |
| `media/raw-html` | Raw HTML — a consumer that sanitizes it will remove it; one that does not has a vulnerability |
| `semver/breaking-needs-major` | Version/content agreement — gated on `product.versioning: semver`, only ever flagged, never derived; 0.x and pre-release finalizations are skipped |
| `semver/added-needs-minor` | Same gating as above |

### Info

| Rule | What it catches |
| :-- | :-- |
| `heading/date-only` | A date-only value means midnight UTC and is a lossy sort key |
| `heading/skipped` | Dateless headings are not candidates; suppressed for `## Unreleased` |
| `conformance/uncategorized-sections` | An entry organizes changes under sections other than the six categories, so it reaches Level 1, not Level 2 |
| `document/no-entries` | The document contains no release entries |

## Notes on interpretation

The spec is a draft; where it leaves room, this tool takes these positions:

- **Unpadded dates are treated as candidates.** The spec's candidate test is the `\d{4}-\d{2}-\d{2}` substring, but its own error examples include `## 2026-7-9` — the validator widens the test so the near-miss is diagnosed rather than silently skipped.
- **A trailing prose credit stays in the prose.** A bare `@handle` at the end of a sentence (`Reported by @finch.`) is not detached; a credit is tail when thanks-prefixed or comma-joined.
- **Link-only bodies** are flagged when an entry has no sections, no summary, and its whole body is one link or bare URL.
- **Version grammar is the spec's, not semver's** — `338.13` and `1.2.3.4` are versions; `1.0rc1` (PEP 440) is a title.
- **A date-only value means midnight UTC**, for ordering and for identity.
- **A reference-style heading is a link.** `## [1.2.3] - date` with a `[1.2.3]: url` definition anywhere in the file has that URL, as CommonMark renders it. Definitions are document furniture: the ones Keep a Changelog keeps at the foot are not content of the last entry.

## Development

```console
npm test               # vitest — the spec's reference example is the primary fixture
npm run test:coverage  # v8 coverage: text summary + html + lcov in coverage/
npm run build          # tsc → dist/
npm run lint           # biome
```

This repository's own [`CHANGELOG.md`](./CHANGELOG.md) is a declarative changelog, validated in CI by the tool itself. Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## See also

- [The Declarative Changelogs standard](https://whatsnew.fyi/spec) — the spec this tool implements
- [Keep a Changelog](https://keepachangelog.com) — the six categories, adopted unchanged
- [whatsnew.fyi](https://whatsnew.fyi) — the aggregator the standard was measured against

## License

[MIT](./LICENSE) © Jeffrey Walter Mixon
