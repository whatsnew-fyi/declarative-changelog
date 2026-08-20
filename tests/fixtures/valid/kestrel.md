---
changelog: "0.1"
product:
  name: Kestrel
  vendor: Corvid Labs
  homepage: https://kestrel.example
  id: kestrel
  description: A task runner for large repositories.
  platforms: [windows, macos, linux]
  versioning: semver
  category: developer-tools
document:
  updated: 2026-07-28T14:02:00Z
  coverage: partial
  canonical: https://kestrel.example/changelog
  locale: en
  older: https://kestrel.example/changelog/1.x.md
---

# Kestrel changelog

## Unreleased

Remote cache eviction policies, and a `kestrel explain` subcommand for inspecting why a task ran.

## [3.0.0-rc.1](https://kestrel.example/releases/3.0.0-rc.1) — 2026-07-24

> Remote caching enters release-candidate testing. The cache protocol may still change before 3.0.0.

### Added

- Task outputs can be pushed to and restored from any S3-compatible bucket with `kestrel cache remote`.
- `kestrel doctor` reports cache hit rates for the last 50 runs.

### Changed

- **Breaking** — the lockfile format moved to version 4. Lockfiles written by this release cannot be
  read by 2.x, so a repository upgrades all at once rather than one contributor at a time.

### Removed

- **Breaking** — `--serial` has been removed, as announced in 2.4.0. Use `--jobs 1`.

## [2.4.1](https://kestrel.example/releases/2.4.1) — 2026-07-14T09:12:00Z (routine)

> Dependency updates and a re-signed macOS build.

No user-facing changes. The macOS binary is notarized under a new certificate; upgrading is optional
unless Gatekeeper is refusing to launch 2.4.0.

## [2.4.0: Parallel task graphs](https://kestrel.example/releases/2.4.0) — 2026-07-09T10:00:00Z

> Task graphs run in parallel by default, which cuts a cold build of a thousand-task repository
> roughly in half.

### Added

- Tasks with no declared dependency on each other now run in parallel. ([#1204](https://github.com/corvid/kestrel/issues/1204), thanks @wren)
- `--jobs N` bounds scheduler concurrency. The default is the CPU count minus one.

### Changed

- `kestrel run` prints a live task tree instead of interleaved log lines. Redirecting output to a
  file restores the previous line-oriented format.

### Deprecated

- `--serial` is deprecated in favour of `--jobs 1`, and will be removed in 3.0.

### Removed

- The `KESTREL_LEGACY_RESOLVER` environment variable has been removed. The resolver it selected was
  dropped in 2.0 and the variable has had no effect since, so nothing changes by removing it.

### Fixed

- `kestrel watch` no longer misses edits to symlinked files. ([#1187](https://github.com/corvid/kestrel/issues/1187))
- Task output is no longer truncated when a task exits within 10ms of its last write to stdout.

### Security

- Task manifests fetched over plain HTTP are now rejected unless `--allow-insecure-manifests` is
  passed explicitly. Reported by @finch. ([CVE-2026-31882](https://kestrel.example/security/CVE-2026-31882))

## [2.3.0](https://kestrel.example/releases/2.3.0) — 2026-06-11

```changelog
covers: ["2.3.1", "2.3.2"]
```

> Windows support leaves preview. The two patch releases that followed are documented here rather
> than on their own pages.

### Added

- Native Windows builds, including a signed installer and PATH registration.

### Fixed

- Path separators are normalized in task manifests, so a manifest authored on Windows runs unchanged
  on Linux.
- **2.3.1** — the installer no longer fails when `%PROGRAMFILES%` contains a space.
- **2.3.2** — `kestrel watch` releases file handles on Windows, so a watched directory can be
  deleted while Kestrel is running.

## [Watch mode — rewritten from scratch](https://kestrel.example/releases/2026-05-02) — 2026-05-02

> The file watcher was rewritten on top of the platform's native notification APIs. Large
> repositories now start watching in well under a second.

### Changed

- File watching uses `inotify`, `FSEvents` and `ReadDirectoryChangesW` directly rather than polling.
  Startup on a 40,000-file repository fell from roughly nine seconds to under one.

### Fixed

- Editors that write via rename-over-original — Vim, and most JetBrains IDEs — no longer stop being
  watched after the first save.

## [2.2.0](https://kestrel.example/releases/2.2.0) — 2026-04-18

```changelog
channel: lts
```

> The first long-term support release. Security fixes land here until April 2028.

### Added

- `kestrel verify` checks a lockfile against its manifests without running anything.

### Security

- Lockfile digests are verified before any task runs. A tampered lockfile now fails closed.

## [2.1.3](https://kestrel.example/releases/2.1.3) — 2026-03-30 (yanked, linux)

```changelog
superseded-by: "2.2.0"
```

> Withdrawn. The Linux build shipped a resolver regression that could select the wrong task version.
> 2.1.2 was the safe build until 2.2.0 shipped.

### Fixed

- Task resolution no longer consults the global cache when a workspace lockfile is present. This fix
  is correct; the build that shipped it was not.

## [2.1.0](https://kestrel.example/releases/2.1.0) — 2026-03-02

> Incremental builds, plus a substantially faster dependency resolver.

### Scheduler

- Tasks record a content hash of their inputs and are skipped when nothing they depend on changed.
- Resolution is roughly four times faster on repositories with more than 500 tasks.

### CLI

- `kestrel run` accepts glob patterns for task names.
- Exit codes are documented and stable: `0` success, `1` task failure, `2` configuration error.

## 2.0.1 — 2026-02-14

> A single fix for lockfile parsing on Windows.

### Fixed

- Lockfiles written with CRLF line endings parse correctly. Kestrel had been reading the trailing
  `\r` as part of the last field on every line.

## 2026-01-20

> The public task registry moved to `registry.kestrel.example`. No client change is required.

### Changed

- The default registry endpoint is `registry.kestrel.example`. Clients pinned to the previous host
  continue to work through a permanent redirect, which will be maintained until 3.0.

## About this example

This heading contains no date, so it is not a release-heading candidate and a consumer skips it —
the same rule that skips `## Unreleased` at the top of the file. A date-bearing heading that failed
the grammar would be a conformance failure instead; editorial headings stay conformant by staying
dateless. This one is here to keep the annotation and the document in one place without breaking
conformance.

What this document exercises:

| Feature | Where |
| :-- | :-- |
| Skipped `##` headings | `Unreleased`, and this section — dateless, so not candidates |
| Version + title split | `2.4.0: Parallel task graphs` |
| Versionless entry, with a title | `Watch mode — rewritten from scratch` |
| Separator character inside a title | the same entry — the em dash in its title is never mistaken for the one before the date |
| **No permalink** | `2.0.1` — a patch with no page of its own |
| **Bare-date heading** | `2026-01-20` — no version, no title, and nothing invented for either |
| Pre-release from semver alone | `3.0.0-rc.1` — the `-rc.1` suffix is the whole signal |
| Timestamped vs date-only | `2.4.0` and `2.4.1` carry times; the rest do not |
| All six categories, in canonical order | `2.4.0` — Added · Changed · Deprecated · Removed · Fixed · Security |
| `**Breaking**` marker | `3.0.0-rc.1` — and it is a *major* bump, per version/content agreement |
| Deprecate, then remove | `--serial` deprecated in `2.4.0`, removed in `3.0.0-rc.1` |
| A removal that breaks nobody | `2.4.0` drops a variable that had been a no-op since 2.0 — deliberately *not* marked breaking |
| Reference tails | `2.4.0` — issue links, `@wren`, `@finch`, a CVE link — detached into structured references, never discarded |
| `routine` tag | `2.4.1` |
| `yanked` + platform tag | `2.1.3`, which also carries `superseded-by` as a yanked entry should |
| Escape hatch — `channel` | `2.2.0` (`lts`) |
| Escape hatch — `covers` | `2.3.0` — documents `2.3.1` and `2.3.2`, which have no entries |
| Covered-version attribution | `2.3.0` — the bold `**2.3.1**` / `**2.3.2**` items, each naming a version from `covers` |
| Escape hatch — `superseded-by` | `2.1.3` → `2.2.0` — a replacement, and it resolves to a real entry |
| Level 1 only | `2.1.0` — thematic `###` headings, so no categories are extracted |
| `coverage: partial` + `older` + `canonical` | Frontmatter |
| `versioning: semver` | Frontmatter — what switches the version/content agreement check on |

Every entry above reaches **Level 2 (Categorized)** except `2.1.0`, which organizes by subsystem
rather than by category and therefore reaches **Level 1 (Structured)**. That entry is included on
purpose: it is how a large share of good changelogs are actually written, and the standard has to
have an honest answer for it.
