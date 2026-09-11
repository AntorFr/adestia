#!/usr/bin/env bash
# Leftovers worth a line in the report: CLAUDE.md as a fallback doc, the
# marketplace clone, --ephemeral, doctor --json, and resident memory.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
port=45193
log="$here/raw/mock-requests-misc.jsonl"
say() { echo; echo "########## $* ##########"; }

mock_cfg=(
  -c model_provider=mock -c model_providers.mock.name=Mock
  -c "model_providers.mock.base_url=http://127.0.0.1:$port/v1"
  -c model_providers.mock.wire_api=responses -c model_providers.mock.env_key=MOCK_KEY
  -c model=mock-model
)

rm -rf "$here/work-misc" codex-home-misc codex-home-eph
mkdir -p "$here/work-misc"
printf 'MARKER_FROM_CLAUDE_MD\n' > "$here/work-misc/CLAUDE.md"
: > "$log"
node mock-provider.js --port "$port" --log "$log" --script simple &
mock=$!
trap 'kill $mock 2>/dev/null' EXIT
sleep 1

say "does project_doc_fallback_filenames pick up CLAUDE.md?"
./run.sh --codex-home codex-home-misc --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check "${mock_cfg[@]}" \
  -c 'project_doc_fallback_filenames=["CLAUDE.md"]' \
  -C "$here/work-misc" "hello" < /dev/null > /dev/null 2>&1
python3 - "$log" <<'PY'
import json,sys
b=json.loads(open(sys.argv[1]).read().splitlines()[-1])['body']
print('  MARKER_FROM_CLAUDE_MD:', 'PRESENT' if 'MARKER_FROM_CLAUDE_MD' in json.dumps(b) else 'absent')
PY

say "--ephemeral: are session files still written?"
: > "$log"
./run.sh --codex-home codex-home-eph --env MOCK_KEY=mock-secret -- \
  exec --json --skip-git-repo-check "${mock_cfg[@]}" --ephemeral "hello" < /dev/null 2>&1 | tail -2
echo "  rollout files: $(find codex-home-eph/sessions -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "  files at the root of that CODEX_HOME:"; ls codex-home-eph | sed 's/^/    /'

say "was the plugin marketplace cloned again into a fresh CODEX_HOME?"
ls -d codex-home-misc/.tmp/plugins 2>/dev/null && \
  echo "  cloned: $(git -C codex-home-misc/.tmp/plugins log --oneline -1 2>/dev/null)" || \
  echo "  no clone in this home"

say "doctor --json (keys only)"
./run.sh --codex-home codex-home-misc -- doctor --json > raw/doctor.json 2>/dev/null
python3 - <<'PY'
import json
d=json.load(open('raw/doctor.json'))
def keys(o,p=''):
    if isinstance(o,dict):
        for k,v in list(o.items())[:40]:
            print(f'  {p}{k}: {type(v).__name__}')
            if k in ('checks','sections') and isinstance(v,list):
                for c in v[:40]:
                    if isinstance(c,dict):
                        print('     -', c.get('id') or c.get('name'), '->', c.get('status') or c.get('level'))
keys(d)
PY

say "resident memory of one idle app-server"
node measure-rss.mjs
