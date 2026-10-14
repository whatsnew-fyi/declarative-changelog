---
changelog: "0.1"
product:
  name: Kestrel
  homepage: https://github.com/acme/kestrel
  versioning: semver
document:
  updated: 2026-04-03T10:00:00Z
  canonical: https://github.com/acme/kestrel/blob/main/CHANGELOG.md
---

# Kestrel changelog

## [2.1.0](https://github.com/acme/kestrel/releases/tag/v2.1.0) - 2026-04-03T10:00:00Z

### Added

- Add watch mode ([606202c](https://github.com/acme/kestrel/commit/606202cb7bff257d7247aafc7b5c64792c4016a3))

### Fixed

- Keep the cache across restarts ([3b7e3ac](https://github.com/acme/kestrel/commit/3b7e3ac421f24e8331107ea39f000b8b77df012e))

## [2.0.0](https://github.com/acme/kestrel/releases/tag/v2.0.0) - 2026-03-06

### Changed

- **Breaking** — Require Node 22 ([6c6c3e0](https://github.com/acme/kestrel/commit/6c6c3e0a8f46983d10f790cfebe0ce620074e8ef))
- **Breaking** — Run task graphs in parallel by default ([9460470](https://github.com/acme/kestrel/commit/9460470ae355109dc9c8c2eba890ad7b7cc49166))
  - Tasks with undeclared dependencies may now race; declare them.

### Removed

- Drop KESTREL_LEGACY_RESOLVER, a no-op since 1.0 ([9e651c8](https://github.com/acme/kestrel/commit/9e651c8897d901919565b6269d9da5546ecd348a))
- **Breaking** — Drop --serial, deprecated in 1.1.0 ([a20d357](https://github.com/acme/kestrel/commit/a20d357b8f71467f01277a39413be602406ed15d))

### Fixed

- **cli:** Exit 2 on an unknown flag ([b2f9bdd](https://github.com/acme/kestrel/commit/b2f9bdd1ef4a67e3afede1873f2ca48293433065))

## [1.1.1](https://github.com/acme/kestrel/releases/tag/v1.1.1) - 2026-02-11 (routine)

## [1.1.0](https://github.com/acme/kestrel/releases/tag/v1.1.0) - 2026-01-26

### Added

- Add a --dry-run flag ([9691594](https://github.com/acme/kestrel/commit/9691594db379a5df9b43d43f0c90491421fe7c65))

### Changed

- **graph:** Cache the resolved task graph ([afcb655](https://github.com/acme/kestrel/commit/afcb6557360ec6c3cb538615013e9ad25512520b))

### Deprecated

- --serial, in favour of --jobs 1 ([24b5a8c](https://github.com/acme/kestrel/commit/24b5a8cc4068b6f9b9535fb9606247897bf81343))

### Fixed

- Handle empty input ([#12](https://github.com/acme/kestrel/issues/12)) ([629f79e](https://github.com/acme/kestrel/commit/629f79e4bba766c70de664bddf9d6f93450c251e))

### Security

- Reject task manifests fetched over plain HTTP ([ec1eaba](https://github.com/acme/kestrel/commit/ec1eabacee0752dd1716e0348281374137df448d))

## [1.0.0](https://github.com/acme/kestrel/releases/tag/v1.0.0) - 2026-01-10

### Added

- First release ([5ea9b4c](https://github.com/acme/kestrel/commit/5ea9b4cefaf6d1270b9532239ebf65ec454c38ab))
