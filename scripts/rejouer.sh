#!/bin/sh
# Replays the named tests, each with its whole file, and keeps only the named cases in the report (`tests.rejouer` in .sdlc.yaml, `{tests}` = the arguments).
#
# CHOICE ON `{tests}`: the arguments are test names as the JUnit report carries them, separated
# by spaces, each bare or quoted (a name with spaces is quoted), with or without the
# `classname` prefix: `<classname> > <name>` is ONE argument, e.g.
#   scripts/rejouer.sh "packages/web/test/mcp-loading.test.tsx > E-10 loading > some_test"
#   scripts/rejouer.sh "E-10 loading > some_test"      # vitest, any file
#   scripts/rejouer.sh "a workbook is written by name"  # a plugin test (node --test)
# A name is looked up among the vitest tests and the plugin tests (node --test); a classname
# `etape` names a step (`etape > typecheck`, `etape > lint`) and replays that step.
# It writes resultats.xml with the cases it played, under the names the suite gives them, and
# exits non-zero when a test is red, or when a name matches NO test: never a green at zero test.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
[ "$#" -gt 0 ] || { echo "rejouer.sh: no test name given" >&2; exit 2; }
out="$root/.suite-attestee/rejouer"   # inside the ignored .suite-attestee/
rm -rf "$out"
mkdir -p "$out"

workers=$(nproc)
if read -r quota period < /sys/fs/cgroup/cpu.max 2>/dev/null && [ "$quota" != max ]; then
  workers=$(( (quota + period - 1) / period ))
fi

# plan.mjs turns the names into: vitest files, plugin files, screen files (need the build), steps.
node scripts/rejouer-plan.mjs plan "$out" "$@" || exit 2

rc=0
: > "$out/steps.tsv"

# A named test in a screen-test file drives the built server and shell: build them HERE, from
# the extraction, after removing what an earlier pass left, never relying on a stale dist/.
if [ -s "$out/screens.files" ]; then
  rm -rf packages/*/dist packages/web/dist-web packages/web/public/vendor
  t0=$(date +%s)
  if sh -c 'npm run build --workspace @antorfr/adestia-server && npm run build:web --workspace @antorfr/adestia-web' > "$out/build.log" 2>&1; then st=ok; else st=ko; tail -n 40 "$out/build.log" >&2; fi
  printf '%s\t%s\t%s\n' build "$st" "$(( $(date +%s) - t0 ))" >> "$out/steps.tsv"
  [ "$st" = ok ] || { echo "rejouer.sh: build failed" >&2; exit 1; }
  rm -rf packages/web/public/vendor   # copied into dist-web by the build: not left as a second state
fi

# Whole files, no -t. `ALL` (a bare name found in no file's source) plays every file.
if [ -s "$out/vitest.files" ]; then
  if [ "$(head -n 1 "$out/vitest.files")" = ALL ]; then vfiles=""; else vfiles=$(cat "$out/vitest.files"); fi
  # shellcheck disable=SC2086
  env ADESTIA_PATIENCE=4 npx vitest run --maxWorkers=$workers --testTimeout=30000 --hookTimeout=60000 \
    --exclude '**/*.real.test.ts' --exclude '**/node_modules/**' --reporter=junit --outputFile="$out/vitest.xml" \
    $vfiles > "$out/vitest.log" 2>&1 || true
fi
if [ -s "$out/plugins.files" ]; then
  if [ "$(head -n 1 "$out/plugins.files")" = ALL ]; then pfiles='plugins/*/test/*.test.js plugins/test/*.test.js'; else pfiles=$(cat "$out/plugins.files"); fi
  # shellcheck disable=SC2086
  node --test --test-reporter=junit --test-reporter-destination="$out/plugins.xml" $pfiles > "$out/plugins.log" 2>&1 || true
fi
for s in $(cat "$out/steps.args" 2>/dev/null); do
  t0=$(date +%s)
  if npm run "$s" > "$out/$s.log" 2>&1; then st=ok; else st=ko; fi
  printf '%s\t%s\t%s\n' "$s" "$st" "$(( $(date +%s) - t0 ))" >> "$out/steps.tsv"
done

node scripts/rejouer-plan.mjs report "$out" "$root/resultats.xml" "$@"
