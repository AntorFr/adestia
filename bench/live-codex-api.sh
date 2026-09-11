#!/bin/sh
# The same live instance as `live-codex.sh`, driven through the API instead of
# a browser — for when the question is "what did the driver do?" rather than
# "what does it look like?". Keeps its working directory so the log survives.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
port=${PORT:-8732}
codex="$root/spikes/codex-cli/node_modules/.bin/codex"
credential="$root/spikes/codex-cli/codex-home-real/auth.json"
work=${WORK:-$(mktemp -d)}
prompt=${1:-"Dis bonjour en une phrase."}

server_pid=""
cleanup() { [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT

mkdir -p "$work/workspace/pages" "$work/data/secrets"
cp "$credential" "$work/data/secrets/codex-cli.token"
chmod 600 "$work/data/secrets/codex-cli.token"

cat > "$work/adestia.config.yaml" <<YAML
name: Live Codex
port: $port
dataDir: ./data
auth:
  mode: none
workspace:
  root: ./workspace
driver:
  id: codex-cli
  command: $codex
permissions:
  mode: open
YAML

echo "work dir: $work"
(cd "$work" && node "$root/packages/server/bin/adestia.js" >"$work/server.log" 2>&1) &
server_pid=$!

tries=0
until curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -gt 60 ] && { tail -40 "$work/server.log"; exit 1; }
  sleep 1
done

id=$(curl -fsS -X POST "http://127.0.0.1:$port/api/conversations" \
  -H 'content-type: application/json' -d '{"title":"live"}' |
  node -e "let r='';process.stdin.on('data',d=>r+=d).on('end',()=>console.log(JSON.parse(r).id))")
echo "conversation $id"

echo "--- sending the turn, streaming what comes back ---"
body=$(node -e "console.log(JSON.stringify({prompt: process.argv[1], conversationId: process.argv[2]}))" "$prompt" "$id")
curl -sS -N -X POST "http://127.0.0.1:$port/api/turn" \
  -H 'content-type: application/json' -d "$body" --max-time 180 || true

echo
echo "--- server log ---"
cat "$work/server.log"
