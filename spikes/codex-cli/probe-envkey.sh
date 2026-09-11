#!/usr/bin/env bash
# Does exec pick up OPENAI_API_KEY from the environment when auth.json is absent?
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
./run.sh --codex-home codex-home-env --env OPENAI_API_KEY=sk-bogus-env-key \
  -- exec --json --skip-git-repo-check "hi" < /dev/null
echo "exit=$?"
