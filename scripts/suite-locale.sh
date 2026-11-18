#!/bin/sh
# The local level Adestia declares in .sdlc.yaml (`tests.local`): what a phase plays
# while working, faster than scripts/suite-attestee.sh and the same names.
# It plays install, typecheck, lint, vitest WITHOUT the browser and boot test files, and the
# plugins. It plays no build, no guards, no boot — and so no test that needs the built
# server or shell. It writes ONE JUnit report, resultats.xml, through the same
# suite-rapport.mjs: every test and every step keeps the name it has in the attested suite.
# It proves nothing for a commit: only `attester --publier` (the whole suite) does.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
out="$root/.suite-attestee/locale"   # inside the ignored .suite-attestee/
rm -rf "$out"
mkdir -p "$out"
: > "$out/steps.tsv"
failed=0

step() {
  name=$1; shift
  echo "::: $name"
  t0=$(date +%s)
  if "$@" > "$out/$name.log" 2>&1; then st=ok; else st=ko; failed=1; tail -n 40 "$out/$name.log"; fi
  printf '%s\t%s\t%s\n' "$name" "$st" "$(( $(date +%s) - t0 ))" >> "$out/steps.tsv"
  [ "$st" = ok ]
}

# suite-rapport.mjs reports a step that never ran as red; build and boot are not part of this
# level, so their two "not run" cases are dropped (every other case is left as it is).
report() {
  node scripts/suite-rapport.mjs "$out" "$out/brut.xml"
  node -e '
    const fs = require("node:fs")
    const [src, dst] = process.argv.slice(1)
    const xml = fs.readFileSync(src, "utf8")
    const re = /<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g
    const cases = (xml.match(re) ?? []).filter((c) => !/name="(build|boot)"[^>]*>\s*<failure message="step (build|boot) not run"/.test(c))
    const bad = cases.filter((c) => /<failure|<error/.test(c)).length
    const skipped = cases.filter((c) => /<skipped/.test(c)).length
    fs.writeFileSync(dst, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="adestia" tests="${cases.length}" failures="${bad}" skipped="${skipped}">\n${cases.join("\n")}\n</testsuite>\n</testsuites>\n`)
  ' "$out/brut.xml" "$root/resultats.xml"
}

step install npm ci || { report; exit 1; }
step typecheck npm run typecheck
step lint npm run lint

# Files that drive a browser or the launcher are the suite's slow part and need the build:
# found by grep, so a new browser test leaves this level without anyone listing it.
exclusions=""
# The exclusion is unconditional: the screen tests are the `ecrans` level (scripts/suite-ecrans.sh).
for f in $(grep -rlE 'playwright|chromium|launch\.mjs' packages/*/test 2>/dev/null | grep -E '\.test\.tsx?$' | sort); do
  exclusions="$exclusions --exclude $f"
done

workers=$(nproc)
if read -r quota period < /sys/fs/cgroup/cpu.max 2>/dev/null && [ "$quota" != max ]; then
  workers=$(( (quota + period - 1) / period ))
fi
# shellcheck disable=SC2086
step vitest env ADESTIA_PATIENCE=4 npx vitest run --maxWorkers=$workers --testTimeout=30000 --hookTimeout=60000 --exclude '**/*.real.test.ts' --exclude '**/node_modules/**' $exclusions --reporter=junit --outputFile="$out/vitest.xml"
step plugins npm run test:plugins -- --test-reporter=junit --test-reporter-destination="$out/plugins.xml"

report
exit "$failed"
