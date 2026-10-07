#!/bin/bash
# Claude Code cloud sessions start from a fresh clone with no node_modules.
# Install the workspace so lint, typecheck, tests, builds, and `bun run verify`
# work from the first turn. `bun install` also runs `prepare`, which installs
# the pre-commit hook. Safe to run repeatedly.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v bun >/dev/null 2>&1; then
	echo "session-start: bun is not on PATH; install Bun 1.3+ (see mise.toml), then run bun install." >&2
	exit 0
fi

bun install
