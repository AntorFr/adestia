#!/usr/bin/env bash
# One isolated codex run. Nothing of the machine's own leaks in:
#   env -i, HOME and CODEX_HOME both inside this spike folder.
# Usage: ./run.sh [--home <dir>] -- <codex args...>
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
home="$here/isolated-home"
codex_home="$here/codex-home"

extra=("IGNORED_PLACEHOLDER=1")
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home="$here/$2"; shift 2 ;;
    --codex-home) codex_home="$here/$2"; shift 2 ;;
    --env) extra+=("$2"); shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

mkdir -p "$home" "$codex_home" "$here/work"

cd "$here/work"
env -i \
  HOME="$home" \
  CODEX_HOME="$codex_home" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  TERM=dumb \
  NO_COLOR=1 \
  CI=1 \
  "${extra[@]}" \
  "$here/node_modules/.bin/codex" "$@"
