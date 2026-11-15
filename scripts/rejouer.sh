#!/bin/sh
# Replays ONLY the named tests (`tests.rejouer` in .sdlc.yaml, `{tests}` = the arguments).
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

# plan.mjs turns the names into: vitest files + -t pattern, plugin pattern, steps.
node scripts/rejouer-plan.mjs plan "$out" "$@" || exit 2

rc=0
: > "$out/steps.tsv"
if [ -s "$out/vitest.args" ]; then
  # shellcheck disable=SC2046
  env ADESTIA_PATIENCE=4 npx vitest run --maxWorkers=$workers --testTimeout=30000 --hookTimeout=60000 \
    --exclude '**/*.real.test.ts' --exclude '**/node_modules/**' --reporter=junit --outputFile="$out/vitest.xml" \
    --passWithNoTests $(cat "$out/vitest.files") -t "$(cat "$out/vitest.args")" > "$out/vitest.log" 2>&1 || true
fi
if [ -s "$out/plugins.args" ]; then
  node --test --test-reporter=junit --test-reporter-destination="$out/plugins.xml" \
    --test-name-pattern="$(cat "$out/plugins.args")" "plugins/*/test/*.test.js" "plugins/test/*.test.js" > "$out/plugins.log" 2>&1 || true
fi
for s in $(cat "$out/steps.args" 2>/dev/null); do
  t0=$(date +%s)
  if npm run "$s" > "$out/$s.log" 2>&1; then st=ok; else st=ko; fi
  printf '%s\t%s\t%s\n' "$s" "$st" "$(( $(date +%s) - t0 ))" >> "$out/steps.tsv"
done

node scripts/rejouer-plan.mjs report "$out" "$root/resultats.xml" "$@"
