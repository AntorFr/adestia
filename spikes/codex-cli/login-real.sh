#!/usr/bin/env bash
# The one run of this spike that uses a REAL account, with the user's explicit
# go-ahead (2026-09-10). Device flow, because that is the flow a headless
# Adestia server would use. The credential lands in codex-home-real/, which
# .gitignore already excludes.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
mkdir -p codex-home-real
exec ./run.sh --codex-home codex-home-real -- login --device-auth
