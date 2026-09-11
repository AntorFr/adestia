#!/usr/bin/env bash
# Sessions: does exec expose the thread id, resume it, replay history, and can
# the last message be harvested from a file / constrained by a schema?
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
H=codex-home-sessions
port=45190
log="$here/raw/mock-requests-sessions.jsonl"
: > "$log"
rm -rf "$here/$H"

node mock-provider.js --port "$port" --log "$log" --script simple &
mock=$!
trap 'kill $mock 2>/dev/null' EXIT
sleep 1

mock_cfg=(
  -c model_provider=mock
  -c model_providers.mock.name=Mock
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1"
  -c model_providers.mock.wire_api=responses
  -c model_providers.mock.env_key=MOCK_KEY
  -c model=mock-model
)

say() { echo; echo "########## $* ##########"; }

say "first turn, last message written to a file"
./run.sh --codex-home $H --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check "${mock_cfg[@]}" \
  -o "$here/work/last-message.txt" "first question" < /dev/null
echo "exit=$?"
echo "--- last-message.txt:"; cat "$here/work/last-message.txt"; echo

say "resume --last"
./run.sh --codex-home $H --env MOCK_KEY=mock-secret -- \
  exec resume --last --json --skip-git-repo-check "${mock_cfg[@]}" \
  "second question" < /dev/null
echo "exit=$?"

say "what the model saw on the second call (history replayed?)"
python3 - "$log" <<'PY'
import json,sys
lines=open(sys.argv[1]).read().splitlines()
print(f'{len(lines)} model calls')
for n,l in enumerate(lines,1):
    b=json.loads(l)['body']
    roles=[]
    for i in b.get('input',[]):
        t=''.join(c.get('text','') for c in i.get('content',[]))
        roles.append(f"{i.get('role') or i.get('type')}:{t[:40]!r}")
    print(f'  call {n}: prompt_cache_key={b.get("prompt_cache_key")}')
    for r in roles: print('     ',r)
PY

say "sessions on disk"
find "$here/$H/sessions" -type f | sed "s|$here/||"

say "structured output (--output-schema)"
cat > "$here/work/schema.json" <<'JSON'
{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}
JSON
./run.sh --codex-home $H --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check "${mock_cfg[@]}" \
  --output-schema "$here/work/schema.json" "third question" < /dev/null
echo "exit=$?"
echo "--- did the schema reach the wire?"
python3 - "$log" <<'PY'
import json,sys
b=json.loads(open(sys.argv[1]).read().splitlines()[-1])['body']
print('text/format field:', json.dumps(b.get('text'))[:400])
PY
