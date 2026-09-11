#!/usr/bin/env bash
# The deployment trap that killed Copilot in a slim image: `node:22-slim` ships
# no system CA store, and a CLI that reads the OS store dies before any request
# leaves the machine. Does codex care?
#
# Runs the linux/arm64 musl build inside node:22-slim with NO ca-certificates,
# then again WITH it, and compares. Nothing is installed on the host.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

img=node:22-slim
say() { echo; echo "########## $* ##########"; }

say "install the linux build inside a throwaway container, run it without CA certs"
docker run --rm --platform linux/arm64 -v "$here/container-work:/w" -w /w "$img" sh -c '
  set -e
  echo "--- /etc/ssl/certs:"; ls /etc/ssl/certs 2>/dev/null | head -3; echo "(empty above = no system CA store)"
  npm install --no-audit --no-fund --save-exact @openai/codex@0.154.0 >/dev/null 2>&1
  export CODEX_HOME=/w/home; mkdir -p "$CODEX_HOME"
  echo "--- version:"; ./node_modules/.bin/codex --version
  set +e
  echo "--- login status (no network needed):"; ./node_modules/.bin/codex login status; echo "exit=$?"
  echo "--- a turn with no credential (this is where a CA failure would show):"
  ./node_modules/.bin/codex exec --json --skip-git-repo-check "hi" </dev/null 2>&1 | tail -3
'
echo "exit=$?"

say "same image, with ca-certificates installed"
docker run --rm --platform linux/arm64 -v "$here/container-work:/w" -w /w "$img" sh -c '
  set -e
  apt-get update >/dev/null 2>&1 && apt-get install -y ca-certificates >/dev/null 2>&1
  export CODEX_HOME=/w/home2; mkdir -p "$CODEX_HOME"
  ./node_modules/.bin/codex exec --json --skip-git-repo-check "hi" </dev/null 2>&1 | tail -3
'
echo "exit=$?"
