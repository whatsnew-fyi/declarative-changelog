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
  updated: 2026-09-28T00:00:00Z
  coverage: complete
  canonical: https://github.com/whatsnew-fyi/declarative-changelog/blob/main/CHANGELOG.md
---

# declarative-changelog changelog

This file is itself a declarative changelog, validated in CI by the tool it describes.

## Unreleased

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
