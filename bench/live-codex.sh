#!/bin/sh
# Look at the codex driver for real — no faked engine.
#
# The graphical bench cannot do this: it ships no agent CLI and answers the turn
# endpoints from a proxy, so it is trustworthy about what the browser does and
# says nothing about what a driver does. This boots the real server on the host,
# on the real `codex` binary, armed with a real credential, and drives the
# bench's own browser container at it.
#
#   bench/live-codex.sh [scenario] [out]
#
# Everything it makes lives in a temp directory and is removed on the way out.
# The credential is READ from the spike's home and copied into the throwaway
# instance; nothing is written back to it.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scenario=${1:-bench/scenarios/live-codex.mjs}
shots=${2:-bench/shots}
port=${PORT:-8731}
codex="$root/spikes/codex-cli/node_modules/.bin/codex"
credential="$root/spikes/codex-cli/codex-home-real/auth.json"

[ -x "$codex" ] || { echo "no codex binary at $codex — run npm ci in spikes/codex-cli" >&2; exit 2; }
[ -f "$credential" ] || { echo "no credential at $credential — run spikes/codex-cli/login-real.sh" >&2; exit 2; }

work=$(mktemp -d)
mkdir -p "$root/$shots"
server_pid=""

cleanup() {
  # The log FIRST: a browser that crashes takes the rest of the script with it,
  # and the server's own account of the turn is the only thing that says why.
  [ -f "$work/server.log" ] && { echo "--- server log ---"; cat "$work/server.log"; }
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  docker rm -f adestia-live-browser >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/workspace/pages" "$work/data/secrets"
cp "$credential" "$work/data/secrets/codex-cli.token"
chmod 600 "$work/data/secrets/codex-cli.token"

cat > "$work/adestia.config.yaml" <<YAML
name: Bench Codex
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

echo "booting the server on :$port (driver: codex-cli, real binary)"
(cd "$work" && node "$root/packages/server/bin/adestia.js" >"$work/server.log" 2>&1) &
server_pid=$!

tries=0
until curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -gt 60 ] && { echo "the server never answered; log:" >&2; tail -30 "$work/server.log" >&2; exit 1; }
  sleep 1
done
echo "up. what it says about its engine:"
curl -fsS "http://127.0.0.1:$port/api/instance" | node -e "
let raw=''; process.stdin.on('data',(d)=>raw+=d).on('end',()=>{
  const d=JSON.parse(raw); console.log('   ', d.driver.label, '|', d.driver.capabilities.join(', '))
})"

docker build -q -t adestia-bench-browser:latest "$root/bench" >/dev/null
docker run --rm --name adestia-live-browser \
  --add-host host.docker.internal:host-gateway \
  -e BENCH_REAL_ENGINE=1 \
  -e APP_HOST=host.docker.internal -e APP_PORT="$port" \
  -v "$root/bench:/bench" -v "$root/$shots:/shots" -v "$work/data:/data" \
  adestia-bench-browser:latest node /bench/bench.mjs "/bench/${scenario#bench/}"

echo "shots in $shots"
