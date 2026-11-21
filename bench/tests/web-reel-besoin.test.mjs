/**
 * bench/web-reel.sh, played against a FAKE `docker` (the pods have none): what the script
 * concludes from what the instance reports — the verdict and the exit code Monsieur will
 * read after the tag. The real run stays to be played on the published image.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const script = join(root, 'bench/web-reel.sh')

// A docker that answers like a healthy instance. The agent's calls come from FAKE_TOOLS_<label>
// (names, space separated), the Chrome left over from FAKE_CHROME_<label>, its words from FAKE_SAYS_<label>.
const fakeDocker = `#!/bin/bash
cmd=$1; shift
case "$cmd" in
  run) for a in "$@"; do case "$a" in --name) next=1;; *) [ "\${next:-}" = 1 ] && { echo "$a" > "$FAKE_DIR/last"; next=; };; esac; done; exit 0;;
  inspect) case "$*" in *Health*) echo healthy;; *) echo true;; esac;;
  rm) ;;
  logs) ;;
  exec)
    name=$1; shift; label=\${name#adestia-web-reel-}
    case "$*" in
      *client.mjs*)
        var=FAKE_TOOLS_$label; for t in \${!var}; do printf 'TOOL\\t%s\\t\\n' "$t"; done
        var=FAKE_SAYS_$label; printf 'TEXT\\t"The price is on the page.\\\\nTOOLS: %s"\\n' "\${!var:-none}";;
      *chrome.mjs*) var=FAKE_CHROME_$label; [ -n "\${!var:-}" ] && echo "\${!var}";;
    esac;;
esac
exit 0
`

function play(env, args = ['fake/image:1']) {
  const dir = mkdtempSync(join(tmpdir(), 'web-reel-test-'))
  writeFileSync(join(dir, 'docker'), fakeDocker)
  chmodSync(join(dir, 'docker'), 0o755)
  return spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: { PATH: `${dir}:${process.env.PATH}`, HOME: process.env.HOME, FAKE_DIR: dir, WEB_REEL_WAIT: '1', CLAUDE_CODE_OAUTH_TOKEN: 'x', ...env },
  })
}

const goodActive = { FAKE_TOOLS_active: 'mcp__web__browser_navigate mcp__web__browser_snapshot', FAKE_SAYS_active: 'mcp__web__browser_navigate' }

test('a call without an image, or without the token, is refused with 2 before anything runs', () => {
  assert.equal(play({}, []).status, 2)
  const noToken = play({ CLAUDE_CODE_OAUTH_TOKEN: '' })
  assert.equal(noToken.status, 2)
  assert.match(noToken.stderr, /CLAUDE_CODE_OAUTH_TOKEN/)
})

test('the plugin on and a browser tool called, the plugin off and none seen: both behaved, exit 0', () => {
  const r = play(goodActive)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /both runs behaved/)
  assert.match(r.stdout, /chrome processes after the turn ---\n {2}none/)
  assert.match(r.stdout, /mcp__web__browser_navigate/)
})

test('the plugin off, the agent reads the page with the engine\'s own built-in fetch: not a web plugin tool, exit 0', () => {
  const r = play({ ...goodActive, FAKE_TOOLS_inactive: 'WebFetch', FAKE_SAYS_inactive: 'WebFetch, WebSearch' })
  assert.equal(r.status, 0, r.stdout)
  assert.doesNotMatch(r.stdout, /FAIL/)
})

test('the plugin off and a web plugin tool seen: exit 1', () => {
  const r = play({ ...goodActive, FAKE_TOOLS_inactive: 'mcp__web__browser_navigate' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /FAIL: a web tool was seen with the plugin off/)
})

test('the plugin off and the agent says it holds a web plugin tool: exit 1', () => {
  const r = play({ ...goodActive, FAKE_SAYS_inactive: 'mcp__web__browser_navigate' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /the agent names a web tool/)
})

test('the plugin on and no browser tool called: exit 1', () => {
  const r = play({ FAKE_TOOLS_active: 'WebFetch' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /FAIL: no browser tool was called/)
})

test('the plugin on and a withheld tool called: exit 1', () => {
  const r = play({ FAKE_TOOLS_active: 'mcp__web__browser_navigate mcp__web__browser_evaluate' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /a withheld tool was called/)
})

test('a Chrome that survives the turn: exit 1, and it is named', () => {
  const r = play({ ...goodActive, FAKE_CHROME_active: '42 /opt/browsers/chrome-headless-shell --headless' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /FAIL: a Chrome survives the turn/)
  assert.match(r.stdout, /42 \/opt\/browsers/)
})

test('the script codes no price and no Chrome version', () => {
  const source = readFileSync(script, 'utf8').replace(/^page=.*$/m, '')
  assert.doesNotMatch(source, /€|\bEUR\b|\d+[.,]\d{2}\s*(€|eur)/i)
  assert.doesNotMatch(source.replace(/127\.0\.0\.1/g, ''), /\b\d{2,3}\.\d+\.\d+\.\d+\b/)
})
