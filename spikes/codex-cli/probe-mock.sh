#!/usr/bin/env bash
# Point codex at the local mock provider — no OpenAI account, no network.
# Usage: ./probe-mock.sh <wire_api: chat|responses> <script: simple|toolcall> [extra codex args...]
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

wire="${1:-chat}"; shift || true
script="${1:-simple}"; shift || true
port=45188
log="$here/raw/mock-requests-$wire-$script.jsonl"
: > "$log"

node mock-provider.js --port "$port" --log "$log" --script "$script" &
mock=$!
trap 'kill $mock 2>/dev/null' EXIT
sleep 1

./run.sh --codex-home "codex-home-mock-$wire" --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check \
  -c model_provider=mock \
  -c model_providers.mock.name=Mock \
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1" \
  -c "model_providers.mock.wire_api=$wire" \
  -c model_providers.mock.env_key=MOCK_KEY \
  -c model=mock-model \
  "$@" \
  "Say exactly: hello" < /dev/null
echo "exit=$?"
