#!/usr/bin/env bash
# Auth state probes, all against a throwaway CODEX_HOME. No real credential is
# ever read or written: the keys below are deliberately bogus.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

say() { echo; echo "########## $* ##########"; }

say "login status (nothing stored)"
./run.sh --codex-home codex-home-auth -- login status; echo "exit=$?"

say "login --with-api-key <bogus>"
printf 'sk-bogus-not-a-real-key' | ./run.sh --codex-home codex-home-auth -- login --with-api-key
echo "exit=$?"

say "login status (bogus key stored)"
./run.sh --codex-home codex-home-auth -- login status; echo "exit=$?"

say "auth.json shape"
sed -e 's/sk-bogus-not-a-real-key/<REDACTED>/' "$here/codex-home-auth/auth.json" 2>/dev/null || echo "(no auth.json)"

say "exec with the bogus key stored"
./run.sh --codex-home codex-home-auth -- exec --json --skip-git-repo-check -c model_reasoning_effort=low "say hi" < /dev/null
echo "exit=$?"

say "logout"
./run.sh --codex-home codex-home-auth -- logout; echo "exit=$?"

say "login status after logout"
./run.sh --codex-home codex-home-auth -- login status; echo "exit=$?"

say "OPENAI_API_KEY in the environment, nothing stored"
./run.sh --codex-home codex-home-env --env OPENAI_API_KEY=sk-bogus-env-key -- login status; echo "exit=$?"
