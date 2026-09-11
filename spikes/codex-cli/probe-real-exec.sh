#!/usr/bin/env bash
# The authenticated pass, over `codex exec`. Closes report §11.1 and §11.3.
# Real account, deliberately cheap: three short turns.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
mkdir -p raw-auth work-real
H=codex-home-real
say() { echo; echo "########## $* ##########"; }

say "login status (armed)"
./run.sh --codex-home $H -- login status; echo "exit=$?"

say "one real turn, --json, default model"
time ./run.sh --codex-home $H -- exec --json --skip-git-repo-check \
  -C "$here/work-real" "Reply with exactly one word: pong" < /dev/null
echo "exit=$?"

say "the sandbox blind spot with a real model (read-only, asked to write)"
./run.sh --codex-home $H -- exec --json --skip-git-repo-check -s read-only \
  -C "$here/work-real" \
  "Run exactly this shell command, nothing else, then say in one short sentence what happened: echo hi > sandbox-probe.txt" < /dev/null
echo "exit=$?"
echo "--- did the file appear?"; ls "$here/work-real"

say "a model the plan does not have (§11.3)"
./run.sh --codex-home $H -- exec --json --skip-git-repo-check \
  -m definitely-not-a-model -C "$here/work-real" "hi" < /dev/null
echo "exit=$?"
