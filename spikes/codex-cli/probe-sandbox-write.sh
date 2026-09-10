#!/usr/bin/env bash
# What does the driver SEE when the sandbox blocks a write? One fresh mock per
# run, so the tool call really happens each time.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
mode="${1:-read-only}"
H=codex-home-sbx-$mode
port=45192
log="$here/raw/mock-requests-sandbox-$mode.jsonl"
: > "$log"
rm -rf "$here/$H" "$here/work-sbx"
mkdir -p "$here/work-sbx"

node mock-provider.js --port "$port" --log "$log" --script write &
mock=$!
trap 'kill $mock 2>/dev/null' EXIT
sleep 1

echo "########## sandbox = $mode ##########"
./run.sh --codex-home "$H" --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check \
  -c model_provider=mock -c model_providers.mock.name=Mock \
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1" \
  -c model_providers.mock.wire_api=responses -c model_providers.mock.env_key=MOCK_KEY \
  -c model=mock-model -s "$mode" -C "$here/work-sbx" "write a file" < /dev/null
echo "exit=$?"
echo "--- files in the workspace:"
ls "$here/work-sbx"
echo "--- what the model was told:"
python3 - "$log" <<'PY'
import json,sys
lines=open(sys.argv[1]).read().splitlines()
print(f'{len(lines)} model calls')
if len(lines)>1:
    for i in json.loads(lines[-1])['body']['input']:
        if i.get('type')=='function_call_output':
            print(' ',json.dumps(i.get('output'))[:400])
PY
