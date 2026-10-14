# Release-tool templates

Configuration that makes the release tool you already use write a [Declarative Changelog](https://whatsnew.fyi/spec). Every template is tested. CI runs the real tool, at the version pinned in [`package.json`](package.json), over a fixture repository of Conventional Commits. The file it writes must reach Level 2 with no warnings and match the golden copy in [`test/golden/`](test/golden), which is also the quickest way to see what each one produces.

| Tool | Template | How it conforms |
| :-- | :-- | :-- |
| [git-cliff](https://git-cliff.org) | [`git-cliff/cliff.toml`](git-cliff/cliff.toml) | Configuration alone |
| [semantic-release](https://semantic-release.gitbook.io) | [`semantic-release/release.config.mjs`](semantic-release/release.config.mjs) | Configuration alone |
| [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) | [`commit-and-tag-version/.versionrc.mjs`](commit-and-tag-version/.versionrc.mjs) | Configuration alone |
| [release-please](https://github.com/googleapis/release-please) | [`release-please/`](release-please) | `changelog-sections`, then `normalize` on the release PR |
| [Changesets](https://github.com/changesets/changesets) | [`changesets/release.yml`](changesets/release.yml) | `changeset version`, then `normalize` |
| [GoReleaser](https://goreleaser.com) | [`goreleaser/release.yml`](goreleaser/release.yml) | It reads the file: `extract` hands it the tag's entry |

## Commit types

The three configuration-only templates, and release-please's sections, map [Conventional Commits](https://www.conventionalcommits.org) types to the format's categories:

| Commit type | Category |
| :-- | :-- |
| `feat` | Added |
| `perf`, `revert` | Changed |
| `deprecate` | Deprecated |
| `remove` | Removed |
| `fix` | Fixed |
| `security` | Security |
| `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore` | Not listed |

`deprecate`, `remove` and `security` are extensions. Stock Conventional Commits has no type for them, so without them a security fix is filed with the typo fixes and a deprecation cannot be said at all. A `!` or a `BREAKING CHANGE:` footer opens the item with `**Breaking** —`, in the category the commit belongs to, and a breaking commit of an unlisted type shows under Changed. A release of nothing but unlisted types is tagged `(routine)`.

## git-cliff

Copy `cliff.toml` to the root of the repository, and change the product name in `header` and the repository URL in `postprocessors`. Then `git cliff -o CHANGELOG.md` writes the whole file from the tags, and `git cliff --unreleased --tag v1.2.0 --prepend CHANGELOG.md` adds one release. It needs git-cliff 2.14.1 or later, the first version whose `--prepend` replaces a header that changes between runs; on an older one, drop the `updated:` lines from `header`.

## semantic-release

Copy `release.config.mjs`, change the frontmatter in `TITLE`, and install `@semantic-release/changelog` and `@semantic-release/git`. It needs semantic-release 24 or later. The frontmatter carries no `document.updated`: the changelog plugin finds the title by its exact text to know where the old entries start, so the title cannot change between releases.

## commit-and-tag-version

Copy `.versionrc.mjs` and change the frontmatter in `header`. It needs commit-and-tag-version 13 or later on Node 22.12 or later. Start from an empty or missing `CHANGELOG.md`, or run `npx commit-and-tag-version --release-count 0` once to write every release from the tags. Keep the title something other than `# Changelog`, which commit-and-tag-version treats as the place to copy the frontmatter from.

## release-please

Merge `changelog-sections` from `release-please-config.json` into your configuration, start the changelog from `CHANGELOG.md`, and add `release-please.yml` as a workflow. release-please writes `## [1.2.0](compare) (2026-10-14)`, which the heading grammar rejects, and files breaking changes under a section of their own. The workflow runs `declarative-changelog normalize` on the release PR's branch each time release-please rebuilds it, so the PR you merge always conforms. The seed's `## [Unreleased]` gives release-please a place to insert the first release below the frontmatter; normalize moves it back to the top after each release.

## Changesets

Add `declarative-changelog` as a dev dependency and a script to `package.json`:

```json
"version-packages": "changeset version && declarative-changelog normalize --write CHANGELOG.md"
```

then use `release.yml` as the workflow (a monorepo lists every package's file, say `packages/*/CHANGELOG.md`). Changesets writes `## 1.2.0` with no date under Major, Minor and Patch Changes, inside the frontmatter until the file has a heading that starts with a version. normalize moves the entry below the frontmatter, dates it, and files Major as Changed with the Breaking marker, Minor as Added and Patch as Fixed. `--keep-sections` keeps the bump-level names, at Level 1.

## GoReleaser

GoReleaser writes release notes but no changelog file. `release.yml` keeps `CHANGELOG.md` as the one place the notes are written: `declarative-changelog extract` hands GoReleaser the entry for the tag being released, and exits 1 when there is none, so a tag pushed before its notes fails the job instead of shipping an empty release. The same step works for any release body: `softprops/action-gh-release` takes it as `body_path`.

## What no template writes

The summary. A one-line `>` blockquote under the heading is the field consumers show first, and choosing which of forty commits mattered is an editorial call no commit history makes. Write it into the release PR (release-please, Changesets), or into the file after a tool that edits only the new entry (`--prepend`, commit-and-tag-version, semantic-release). Regenerating the whole file from the tags writes over it.

## Running the tests

```sh
npm ci              # at the repository root
cd templates
npm ci
npm test            # npx vitest run -u to rewrite the golden files
```
