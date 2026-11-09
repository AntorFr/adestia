#!/bin/sh
# The suite Adestia declares in .sdlc.yaml and has attested (`attester --publier`).
# It plays what ci.yml used to play, in the same order, from a clean checkout:
# install, typecheck, lint, tests, documentation/bench guards, builds, boot.
# It writes ONE JUnit report, resultats.xml: every test under its own name, and
# each step (install, typecheck, lint, build, boot) as a case of its own.
# It needs no secret. Exit status is non-zero if any step or test is red.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
out="$root/.suite-attestee"
rm -rf "$out"
mkdir -p "$out"
: > "$out/steps.tsv"
failed=0

# step <name> <command…>: run, log, record "name<TAB>status<TAB>seconds".
step() {
  name=$1; shift
  echo "::: $name"
  t0=$(date +%s)
  if "$@" > "$out/$name.log" 2>&1; then st=ok; else st=ko; failed=1; tail -n 40 "$out/$name.log"; fi
  printf '%s\t%s\t%s\n' "$name" "$st" "$(( $(date +%s) - t0 ))" >> "$out/steps.tsv"
  [ "$st" = ok ]
}

report() {
  node scripts/suite-rapport.mjs "$out" "$root/resultats.xml"
}

# The version guard reads git tags; a clean extraction may not carry them.
if [ -z "$(git tag --list 'v*' 2>/dev/null)" ]; then
  git fetch --tags --quiet origin 2>/dev/null || true
fi

# `ci`, never `install`: the lockfile is the version set that was tested.
step install npm ci || { report; exit 1; }
step typecheck npm run typecheck
step lint npm run lint
# Proves the shipped artefact still builds (the tests read TypeScript sources). It comes
# BEFORE the tests because the browser suites drive the built server and shell
# (bench/launch.mjs); with Playwright present they are not skipped, they need the build.
step build sh -c 'npm run build --workspace @antorfr/adestia-server && npm run build:web --workspace @antorfr/adestia-web'

# vitest then the plugins' node --test (what `npm test` plays), each writing JUnit.
# BENCH_FULL_SWEEP=1 plays the 2 x 124-picture sweep, which a skip would turn red.
# The real-SDK probe (claude-lost-session.real) needs CLAUDE_CODE_OAUTH_TOKEN, a secret
# an attested extraction never has: it is not played here, not skipped (see the task discussion).
# Fewer workers than cores: the browser suites time out when 11 of them share the machine.
step vitest env BENCH_FULL_SWEEP=1 npx vitest run --maxWorkers=6 --exclude '**/*.real.test.ts' --exclude '**/node_modules/**' --reporter=junit --outputFile="$out/vitest.xml"
step plugins npm run test:plugins -- --test-reporter=junit --test-reporter-destination="$out/plugins.xml"
step guards node --test --test-reporter=junit --test-reporter-destination="$out/guards.xml" bench/tests/doc-besoin.test.mjs bench/tests/bench-once.test.mjs

boot() {
  dir=$(mktemp -d)
  ( cd "$dir" && exec node "$root/packages/server/bin/adestia.js" ) > "$out/server.log" 2>&1 &
  pid=$!
  ok=1
  for _ in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8730/api/health > /dev/null; then ok=0; break; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  # A server that answers health is one whose whole boot path ran.
  [ "$ok" = 0 ] && curl -sf http://127.0.0.1:8730/api/health
  rc=$?
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  rm -rf "$dir"
  tail -n 20 "$out/server.log"
  return $rc
}
step boot boot

report
exit "$failed"
