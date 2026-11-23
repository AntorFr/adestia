#!/bin/sh
# The `ecrans` level (`node scripts/niveaux.mjs ecrans <base>`, AD-ecrans-sans-local-1): the screen
# tests of the screens the work touches, and nothing else. It plays the server and web builds (the
# browser suites drive them), then ONE vitest run on exactly the files in ADESTIA_JOUER_ECRANS
# (space-separated, as niveaux.mjs computes them). No install, typecheck, lint or plugins: the
# install is declared (`tests.installation`) and played once by the chain before this script.
# An EMPTY selection builds and plays nothing: it writes resultats.xml with zero test cases, prints
# the TAP plan `1..0` and exits 0 (the « vide » run of the chain), without touching node_modules.
# Test names are the suite's own (the build is `etape > build`); a step not played is not reported red.
set -u
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
files=$(echo "${ADESTIA_JOUER_ECRANS:-}" | tr -s ' \t\n' ' ' | sed 's/^ //; s/ $//')

if [ -z "$files" ]; then
  printf '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="adestia" tests="0" failures="0" skipped="0">\n</testsuite>\n</testsuites>\n' > "$root/resultats.xml"
  echo "1..0"
  exit 0
fi

out="$root/.suite-attestee/ecrans"   # inside the ignored .suite-attestee/
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

# suite-rapport.mjs reports a step that never ran as red; this level plays only build and vitest,
# so every "not run" case is dropped (every other case is left as it is).
report() {
  node scripts/suite-rapport.mjs "$out" "$out/brut.xml"
  node -e '
    const fs = require("node:fs")
    const [src, dst] = process.argv.slice(1)
    const xml = fs.readFileSync(src, "utf8")
    const re = /<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g
    const cases = (xml.match(re) ?? []).filter((c) => !/<failure message="step [a-z]+ not run"/.test(c))
    const bad = cases.filter((c) => /<failure|<error/.test(c)).length
    const skipped = cases.filter((c) => /<skipped/.test(c)).length
    fs.writeFileSync(dst, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="adestia" tests="${cases.length}" failures="${bad}" skipped="${skipped}">\n${cases.join("\n")}\n</testsuite>\n</testsuites>\n`)
  ' "$out/brut.xml" "$root/resultats.xml"
}

step build sh -c 'npm run build --workspace @antorfr/adestia-server && npm run build:web --workspace @antorfr/adestia-web' || { report; exit 1; }

workers=$(nproc)
if read -r quota period < /sys/fs/cgroup/cpu.max 2>/dev/null && [ "$quota" != max ]; then
  workers=$(( (quota + period - 1) / period ))
fi
# shellcheck disable=SC2086
step vitest env ADESTIA_PATIENCE=4 npx vitest run --maxWorkers=$workers --testTimeout=30000 --hookTimeout=60000 --exclude '**/*.real.test.ts' --exclude '**/node_modules/**' --reporter=junit --outputFile="$out/vitest.xml" $files

report
exit "$failed"
