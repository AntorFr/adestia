#!/bin/bash
# Play a REAL agent turn against the published image, with the `web` plugin on
# and then off, and look at what it did.
#
#   CLAUDE_CODE_OAUTH_TOKEN=… bench/web-reel.sh <image> [page-url]
#
# <image> is the one to judge (the image published at the delivery tag); nothing
# is built here. The page defaults to the protected shop page the plugin was
# designed for. Nothing about the machine is assumed beyond Docker and the
# token, so it runs as it is from `homenode`, whose outgoing address is the one
# that matters for the site's refusal.
#
# For each of the two configurations it prints: the text the agent rendered,
# the tool names seen (the ones it called, and the ones it says it has), the
# page file written under `.adestia-web/` of the workspace, and whether any
# Chrome process survives the turn. It codes no price and no Chrome version: the
# price is whatever the page says on the day, and a refusal by the site is a
# result to read, not a failure of the script.
#
# Exit: 0 when both runs behaved (active: a browser tool was called; inactive:
# no `web` tool seen; neither leaves a Chrome); 1 otherwise; 2 on a bad call.
# Everything it makes is named `adestia-web-reel-*` and removed on the way out.
set -u

image=${1:-}
page=${2:-https://vetsecurite.com/tentes-baches/33731-supertarp-small-r-olive-green-helikon-5908218775176.html}
wait_chrome=${WEB_REEL_WAIT:-30}        # seconds a Chrome may take to go after the turn
turn_limit=${WEB_REEL_TURN_LIMIT:-600}  # seconds a turn may take

[ -n "$image" ] || { echo "usage: bench/web-reel.sh <image> [page-url]" >&2; exit 2; }
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] || { echo "web-reel: CLAUDE_CODE_OAUTH_TOKEN is not set — a real turn cannot run" >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "web-reel: docker is not available" >&2; exit 2; }

work=$(mktemp -d)
names=""
cleanup() {
  for n in $names; do docker rm -f "$n" >/dev/null 2>&1 || true; done
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

# The in-container client: one conversation, one turn, the stream read to its end.
# It runs with the image's own node, so the script needs no port and no curl.
cat > "$work/client.mjs" <<'JS'
const base = 'http://127.0.0.1:8730'
const prompt = process.argv[2]
const limit = Number(process.argv[3]) * 1000
const conv = await (await fetch(`${base}/api/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
const res = await fetch(`${base}/api/turn`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt, conversationId: conv.id }),
  signal: AbortSignal.timeout(limit),
})
if (!res.ok || !res.body) { console.log(`ERROR\thttp ${res.status}`); process.exit(1) }
let text = ''
let buffer = ''
const decoder = new TextDecoder()
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true })
  let cut
  while ((cut = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, cut)
    buffer = buffer.slice(cut + 2)
    const data = frame.split('\n').find((line) => line.startsWith('data: '))
    if (!data) continue
    const event = JSON.parse(data.slice(6))
    if (event.type === 'text-delta') text += event.text
    else if (event.type === 'tool-use') console.log(`TOOL\t${event.name}\t${event.target ?? ''}`)
    else if (event.type === 'error') console.log(`ERROR\t${event.message}`)
  }
}
console.log(`TEXT\t${JSON.stringify(text)}`)
JS

# Any process whose command line names a Chrome. /proc is read by the image's own
# node: the image need not carry `ps`.
cat > "$work/chrome.mjs" <<'JS'
import { readdirSync, readFileSync } from 'node:fs'
for (const pid of readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
  try {
    const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ')
    if (/chrom|headless[-_]shell/i.test(cmd) && !cmd.includes('chrome.mjs')) console.log(`${pid} ${cmd.slice(0, 160)}`)
  } catch { /* gone while read */ }
}
JS

play() { # <label> <tools-yaml>
  label=$1; tools=$2
  name="adestia-web-reel-$label"
  names="$names $name"
  mkdir -p "$work/$label/data" "$work/$label/workspace"
  chmod 777 "$work/$label/data" "$work/$label/workspace"
  cat > "$work/$label/adestia.config.yaml" <<YAML
name: Web reel
auth:
  mode: none
driver:
  id: claude-code
permissions:
  mode: open
extensions:
  tools: $tools
YAML
  chmod 755 "$work/$label"; chmod 644 "$work/$label/adestia.config.yaml" "$work/client.mjs" "$work/chrome.mjs"
  echo
  echo "=============== $label (extensions.tools: $tools) ==============="
  # The token is passed by NAME so it never shows in a process list.
  docker run -d --name "$name" -e CLAUDE_CODE_OAUTH_TOKEN \
    -v "$work/$label/data:/data" -v "$work/$label/workspace:/workspace" \
    -v "$work/$label/adestia.config.yaml:/conf/adestia.config.yaml:ro" \
    -v "$work/client.mjs:/conf/client.mjs:ro" -v "$work/chrome.mjs:/conf/chrome.mjs:ro" \
    "$image" --config /conf/adestia.config.yaml >/dev/null || { echo "web-reel: the image would not start"; return 1; }
  tries=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null)" = healthy ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt 90 ] || [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" != true ]; then
      echo "web-reel: the instance did not become healthy"; docker logs "$name" 2>&1 | tail -20; return 1
    fi
    sleep 1
  done

  prompt="Read the product page $page and tell me its price, exactly as the page writes it. If you cannot read the page, say so and say why. Then end your answer with one last line, \`TOOLS: \`, followed by the exact names of every tool you have whose name mentions web or browser (\`TOOLS: none\` if there is none)."
  out=$(docker exec "$name" node /conf/client.mjs "$prompt" "$turn_limit" 2>&1)
  echo "--- tools the agent called ---"
  echo "$out" | grep -P '^TOOL\t' | cut -f2 | sort | uniq -c | sed 's/^/  /'
  echo "--- rendered text ---"
  echo "$out" | grep -P '^TEXT\t' | cut -f2- | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")) + "\n")' 2>/dev/null \
    || echo "$out" | grep -v -P '^TOOL\t'
  echo "$out" | grep -P '^ERROR\t' | sed 's/^/  engine error: /'
  echo "--- page files written (.adestia-web/) ---"
  docker exec "$name" sh -c 'find /workspace/.adestia-web -type f 2>/dev/null | head -20' | while read -r f; do
    echo "  $f ($(docker exec "$name" sh -c "wc -c < '$f'") bytes)"
    docker exec "$name" head -c 600 "$f" | sed 's/^/    | /'
  done

  # Chrome gets `wait_chrome` seconds to go: the turn ends, the relay is told by
  # the closed stdin, and the browser dies with its group.
  left=""
  for _ in $(seq 1 "$wait_chrome"); do
    left=$(docker exec "$name" node /conf/chrome.mjs)
    [ -z "$left" ] && break
    sleep 1
  done
  echo "--- chrome processes after the turn ---"
  if [ -z "$left" ]; then echo "  none"; else echo "$left" | sed 's/^/  /'; fi

  seen=$(echo "$out" | grep -P '^TOOL\t' | cut -f2)
  said=$(echo "$out" | grep -o 'TOOLS: [^"\\]*' | tail -1)
  echo "--- tools the agent says it has ---"
  echo "  ${said:-(no TOOLS line)}"

  verdict=0
  [ -z "$left" ] || { echo "FAIL: a Chrome survives the turn"; verdict=1; }
  if [ "$label" = active ]; then
    echo "$seen" | grep -q 'browser_' || { echo "FAIL: no browser tool was called"; verdict=1; }
    echo "$seen" | grep -Eq 'browser_(run_code_unsafe|evaluate|file_upload)' && { echo "FAIL: a withheld tool was called"; verdict=1; }
  else
    echo "$seen" | grep -Eiq 'web|browser' && { echo "FAIL: a web tool was seen with the plugin off"; verdict=1; }
    echo "$said" | grep -Eiq 'mcp__web|browser_' && { echo "FAIL: the agent names a web tool with the plugin off"; verdict=1; }
  fi
  docker rm -f "$name" >/dev/null 2>&1
  return $verdict
}

status=0
play active '[web]' || status=1
play inactive '[]' || status=1
echo
[ "$status" = 0 ] && echo "web-reel: both runs behaved. Read the prices above against the page itself." || echo "web-reel: FAILED — see the FAIL lines above."
exit $status
