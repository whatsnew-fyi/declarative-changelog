### Changed

- **Breaking** — Run task graphs in parallel by default ([9460470](https://github.com/acme/kestrel/commit/9460470ae355109dc9c8c2eba890ad7b7cc49166))
  - Tasks with undeclared dependencies may now race; declare them.
- **Breaking** — Require Node 22 ([6c6c3e0](https://github.com/acme/kestrel/commit/6c6c3e0a8f46983d10f790cfebe0ce620074e8ef))

### Removed

- **Breaking** — Drop --serial, deprecated in 1.1.0 ([a20d357](https://github.com/acme/kestrel/commit/a20d357b8f71467f01277a39413be602406ed15d))
- Drop KESTREL_LEGACY_RESOLVER, a no-op since 1.0 ([9e651c8](https://github.com/acme/kestrel/commit/9e651c8897d901919565b6269d9da5546ecd348a))

### Fixed

- **cli:** Exit 2 on an unknown flag ([b2f9bdd](https://github.com/acme/kestrel/commit/b2f9bdd1ef4a67e3afede1873f2ca48293433065))
