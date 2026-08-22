# Contributing

Thanks for your interest in the project. This is the reference implementation of a **draft** standard, which shapes what contributions look like.

## The spec comes first

This tool implements the [Declarative Changelogs standard](https://whatsnew.fyi/spec), v0.1. Behavior questions are spec questions:

- If the spec is clear and the tool disagrees with it, that is a bug here — please open an issue.
- If the spec is ambiguous, the tool's position is documented under *Notes on interpretation* in the README. Challenges to those positions are welcome, but they are spec discussions, and the resolution may land in the spec rather than in code.
- New rules, tags, keys, or categories are spec changes, not feature requests against this repository.

Every closed vocabulary (tags, categories, escape-hatch keys, frontmatter keys) lives in [`src/constants.ts`](src/constants.ts), so a spec revision is an edit to one file.

## Development

```console
npm ci
npm test               # vitest — the spec's reference example is the primary fixture
npm run test:coverage  # v8 coverage: text summary + html + lcov in coverage/
npm run build          # tsc → dist/
npm run lint           # biome
npm run cli -- validate CHANGELOG.md   # run the CLI from source via tsx
```

Requires Node.js ≥ 20.

## Pull requests

- Every rule change needs a test. The fixture pair in `tests/fixtures/` (one valid document, one invalid) is the place for end-to-end cases; unit tests sit next to the area they cover.
- `npm run lint` and `npm test` must pass; CI also validates this repository's own `CHANGELOG.md` with the built CLI at Level 2 with zero warnings.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `test:`, `docs:`, …), with `!` for breaking changes.
- Diagnostics are part of the interface: a message should name what is wrong, what the spec wants, and what a consumer will do with the damage. Match the tone of the existing ones.

## Releases

Releases are cut by publishing a GitHub release; CI publishes to npm with provenance. `CHANGELOG.md` — itself a declarative changelog — is updated as part of the release commit.
