#!/usr/bin/env bash
# Which instruction files does codex read, and what does the default exec
# sandbox actually stop?
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
H=codex-home-instr
port=45191
log="$here/raw/mock-requests-instructions.jsonl"
: > "$log"
rm -rf "$here/$H" "$here/work-instr"
mkdir -p "$here/work-instr"

cat > "$here/work-instr/AGENTS.md" <<'MD'
# Spike marker
MARKER_FROM_AGENTS_MD — if you can read this, AGENTS.md reached the model.
MD
cat > "$here/work-instr/CLAUDE.md" <<'MD'
MARKER_FROM_CLAUDE_MD — does codex read the other agent's dialect?
MD

node mock-provider.js --port "$port" --log "$log" --script write &
mock=$!
trap 'kill $mock 2>/dev/null' EXIT
sleep 1

say() { echo; echo "########## $* ##########"; }

say "run with AGENTS.md and CLAUDE.md present, default sandbox, model tries to write a file"
./run.sh --codex-home $H --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check \
  -c model_provider=mock -c model_providers.mock.name=Mock \
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1" \
  -c model_providers.mock.wire_api=responses -c model_providers.mock.env_key=MOCK_KEY \
  -c model=mock-model -C "$here/work-instr" "write a file" < /dev/null
echo "exit=$?"
echo "--- did the write land?"
ls -la "$here/work-instr" | sed "s|$here/||"

say "which markers reached the wire"
python3 - "$log" <<'PY'
import json,sys
b=json.loads(open(sys.argv[1]).read().splitlines()[0])['body']
blob=json.dumps(b)
for m in ('MARKER_FROM_AGENTS_MD','MARKER_FROM_CLAUDE_MD'):
    print(f'  {m}: {"PRESENT" if m in blob else "absent"}')
PY

say "same run with -s workspace-write"
: > "$log"
./run.sh --codex-home $H --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check \
  -c model_provider=mock -c model_providers.mock.name=Mock \
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1" \
  -c model_providers.mock.wire_api=responses -c model_providers.mock.env_key=MOCK_KEY \
  -c model=mock-model -s workspace-write -C "$here/work-instr" "write a file" < /dev/null
echo "exit=$?"
echo "--- did the write land?"
ls "$here/work-instr"

say "codex doctor"
./run.sh --codex-home $H -- doctor; echo "exit=$?"
