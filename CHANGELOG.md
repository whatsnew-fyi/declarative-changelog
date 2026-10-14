---
changelog: "0.1"
product:
  name: declarative-changelog
  vendor: whatsnew.fyi
  homepage: https://github.com/whatsnew-fyi/declarative-changelog
  description: Validator and reference parser for the Declarative Changelogs standard.
  versioning: semver
  category: developer-tools
document:
  updated: 2026-10-14T00:00:00Z
  coverage: complete
  canonical: https://github.com/whatsnew-fyi/declarative-changelog/blob/main/CHANGELOG.md
---

# declarative-changelog changelog

This file is itself a declarative changelog, validated in CI by the tool it describes.

## [0.3.1](https://github.com/whatsnew-fyi/declarative-changelog/releases/tag/v0.3.1) — 2026-10-14T00:00:00Z (routine)

> The GitHub Action's description is shorter, to fit the Marketplace's 125-character limit. The CLI is unchanged.

## [0.3.0](https://github.com/whatsnew-fyi/declarative-changelog/releases/tag/v0.3.0) — 2026-10-14T00:00:00Z

> Release tools can write a conforming changelog: `normalize` repairs what release-please and changesets produce, and the repository is now a GitHub Action and a pre-commit hook.

### Added

- `normalize` command that repairs new entries after a release tool writes them: release-please's `(date)` headings, changesets' undated headings and Major/Minor/Patch sections, `### ⚠ BREAKING CHANGES` items (marked with `**Breaking**` where they belong), tool section names, section order, a displaced frontmatter, and `document.updated`. `--check` fails when a file needs it; `--all` repairs history without re-dating it.
- `extract` command that prints one entry's notes as markdown, for GitHub release bodies and goreleaser's `--release-notes`.
- `--format github` for `validate`, which writes workflow annotations GitHub pins to the line in a PR.
- A GitHub Action (`uses: whatsnew-fyi/declarative-changelog@v0`) that validates with annotations and can ask What's New to read the changelog after a deploy.
- A pre-commit hook (`id: declarative-changelog`) that runs the published CLI at its tag.
- `heading/bracketed-label` warning for `## [1.2.3] - date` with no `[1.2.3]: url` definition, which leaves the release with a title and no version.
- `normalizeChangelog` and `extractEntry` in the library.

### Fixed

- A release heading written as a reference link, `## [1.2.3] - date` with `[1.2.3]: url` at the foot of the file (Keep a Changelog's own style), now carries that URL.
- Link definitions at the foot of the file are no longer read as content of the last entry's last section, which reported `entry/section-content`.

## [0.2.1](https://github.com/whatsnew-fyi/declarative-changelog/releases/tag/v0.2.1) — 2026-10-03T00:00:00Z

> The package now loads through `require()`, so CommonJS and `tsx` scripts can use it.

### Fixed

- The package can now be loaded with `require()`, including by `tsx` scripts in CommonJS projects. Its `exports` map declares a `default` condition next to `import`, so Node's `require(esm)` support (Node 20.19+, 22.12+) resolves it instead of failing with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## [0.2.0](https://github.com/whatsnew-fyi/declarative-changelog/releases/tag/v0.2.0) — 2026-09-28T00:00:00Z

> `product.color` follows the spec's bare-hex form, and an empty color now says why it's empty.

### Changed

- **Breaking** — `product.color` now takes six bare hex digits (`1a73e8`), matching the spec. A leading `#` is still accepted and stripped, so parsed output always carries the bare form.

### Fixed

- A `product.color` left empty by an unquoted `#` (`color: #1a73e8` parses as a YAML comment) now reports that cause instead of an empty value.

## [0.1.0](https://github.com/whatsnew-fyi/declarative-changelog/releases/tag/v0.1.0) — 2026-08-21T00:00:00Z

> First public release: a validator and reference parser for v0.1 of the Declarative Changelogs standard.

### Added

- `validate` command that lints one or more documents (or stdin) against the v0.1 spec and reports the computed conformance level, entry count, addressability, and skipped headings.
- `parse` command that emits the spec's consumer view as JSON: derived entry ids, resolved URLs, categorized changes with detached structured references, effective platforms, and lifecycle flags.
- Pretty and versioned-JSON output formats, with `--require-level`, `--max-warnings`, and `--quiet` for CI gating.
- `--follow-older` flag that walks the `document.older` archive chain so `superseded-by` can resolve across documents.
- Library API: `validateChangelog`, `parseChangelog`, and `loadArchiveChain`, with full TypeScript types.
