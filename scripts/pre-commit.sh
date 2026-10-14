#!/usr/bin/env sh
# The pre-commit hook's entry point (.pre-commit-hooks.yaml). It runs the CLI
# published to npm at this checkout's own version, so a hook pinned to a tag
# runs exactly what that tag released, with nothing to build.
set -eu
dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
version=$(node -p "require(process.argv[1]).version" "$dir/package.json")
exec npx --yes "declarative-changelog@${version}" "$@"
