#!/bin/bash
# Runs at the start of every Claude Code session. Its stdout reaches the
# agent's context, so it ends by printing what the work should serve: the
# maintenance notice when AGENTS.md has one, and the active bet.
#
# Cloud sessions start from a fresh clone with no node_modules, so there it
# first installs the workspace (which also runs `prepare` and installs the
# pre-commit hook). Safe to run repeatedly.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v bun >/dev/null 2>&1; then
	echo "session-start: bun is not on PATH; install the Bun version mise.toml pins, then run bun install." >&2
	exit 0
fi

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
	bun install >&2
fi

if grep -q '^## Maintenance mode' AGENTS.md 2>/dev/null; then
	echo "AGENTS.md: the repository is in maintenance. Read its \"Maintenance mode\" section before taking work."
fi

if [ -d node_modules ]; then
	# The bet is context, not a gate: a failure here must not block the session.
	bun scripts/bookkit.ts bets 2>/dev/null || true
fi
