#!/usr/bin/env bash
set -euo pipefail

SKILL_SET_NAME="bookkit"

usage() {
  cat <<'USAGE'
Usage: scripts/codex-setup.sh [options]

Prepare a Codex-friendly local environment for the Bookkit workspace.

Options:
  --skip-install   Skip `bun install`.
  --skip-checks    Skip `bun run validate` and `bun run check:separation`.
  --copy-skills    Copy skills into CODEX_HOME instead of symlinking.
  -h, --help       Show this help message.
USAGE
}

log() {
  printf '\n[bookkit-codex-setup] %s\n' "$*"
}

fail() {
  printf '\n[bookkit-codex-setup] ERROR: %s\n' "$*" >&2
  exit 1
}

version_gte() {
  local lhs="$1" rhs="$2"
  [[ "$(printf '%s\n%s\n' "$rhs" "$lhs" | sort -V | tail -n1)" == "$lhs" ]]
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SKILLS_SOURCE_DIR="${REPO_ROOT}/.codex/skills"
CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
CODEX_SKILLS_DIR="${CODEX_HOME}/skills/${SKILL_SET_NAME}"

SKIP_INSTALL=0
SKIP_CHECKS=0
COPY_SKILLS=0

while (($# > 0)); do
  case "$1" in
    --skip-install)
      SKIP_INSTALL=1
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      ;;
    --copy-skills)
      COPY_SKILLS=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

cd "${REPO_ROOT}"

log "Repository root: ${REPO_ROOT}"

command -v git >/dev/null 2>&1 || fail "git is required"
command -v node >/dev/null 2>&1 || fail "node is required (see engines.node in package.json)"
command -v bun >/dev/null 2>&1 || fail "bun is required (see engines.bun in package.json)"

# The minimums are set once, in package.json "engines".
engine_minimum() {
  node -p "require('./package.json').engines['$1'].replace(/^>=/, '')"
}
MIN_NODE_VERSION="$(engine_minimum node)"
MIN_BUN_VERSION="$(engine_minimum bun)"

NODE_VERSION_RAW="$(node -v | sed 's/^v//')"
BUN_VERSION_RAW="$(bun --version)"

version_gte "${NODE_VERSION_RAW}" "${MIN_NODE_VERSION}" || fail "node ${MIN_NODE_VERSION}+ required; found ${NODE_VERSION_RAW}"
version_gte "${BUN_VERSION_RAW}" "${MIN_BUN_VERSION}" || fail "bun ${MIN_BUN_VERSION}+ required; found ${BUN_VERSION_RAW}"

log "Detected node ${NODE_VERSION_RAW} and bun ${BUN_VERSION_RAW}"

if ((SKIP_INSTALL == 0)); then
  log "Installing dependencies with bun"
  bun install
else
  log "Skipping dependency install (--skip-install)"
fi

if [[ ! -d "${SKILLS_SOURCE_DIR}" ]]; then
  fail "skills source directory not found at ${SKILLS_SOURCE_DIR}"
fi

log "Preparing Codex skills at ${CODEX_SKILLS_DIR}"
mkdir -p "${CODEX_HOME}/skills"

if [[ -L "${CODEX_SKILLS_DIR}" || -e "${CODEX_SKILLS_DIR}" ]]; then
  rm -rf "${CODEX_SKILLS_DIR}"
fi

if ((COPY_SKILLS == 1)); then
  cp -R "${SKILLS_SOURCE_DIR}" "${CODEX_SKILLS_DIR}"
  log "Copied skill files"
else
  ln -s "${SKILLS_SOURCE_DIR}" "${CODEX_SKILLS_DIR}"
  log "Symlinked skill files"
fi

if ((SKIP_CHECKS == 0)); then
  log "Running baseline workspace checks"
  bun run validate
  bun run check:separation
else
  log "Skipping workspace checks (--skip-checks)"
fi

cat <<DONE

[bookkit-codex-setup] Setup complete.

Next steps:
  1) Start an app: bun run bookkit dev bad-people
  2) Run upgrade safety net before larger changes: bun run check:upgrade
  3) Review lane skills under: ${CODEX_SKILLS_DIR}
DONE
