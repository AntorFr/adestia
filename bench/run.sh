#!/bin/sh
# Boot the real image, look at it through a real browser, tear it all down.
#
#   bench/run.sh [scenario] [out]
#
# Defaults to `bench/scenarios/turn-parts.mjs`, writing PNGs to `bench/shots/`.
# Everything it creates is named `adestia-bench-*` and removed on the way out;
# the app's data lives in a throwaway directory, never in `./data`.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scenario=${1:-bench/scenarios/turn-parts.mjs}
shots=${2:-bench/shots}
data=$(mktemp -d)
stage=$(mktemp -d)
mkdir -p "$root/$shots"
chmod 777 "$data" "$root/$shots"
chmod 755 "$stage"

cleanup() {
  docker rm -f adestia-bench-app >/dev/null 2>&1 || true
  docker network rm adestia-bench >/dev/null 2>&1 || true
  rm -rf "$data" "$stage"
}
trap cleanup EXIT

# A scenario that needs more than a bare instance — a plugin switched on, a
# repository to read — ships `<name>.prep.sh` beside itself. It is handed a
# scratch directory to build whatever it needs and prints one `src:dst[:ro]`
# volume per line; both are removed on the way out with everything else. No
# flag to remember: the file being there IS the request.
mounts=""
prep="${scenario%.mjs}.prep.sh"
if [ -f "$root/$prep" ]; then
  mounts=$(sh "$root/$prep" "$stage")
fi

# By explicit PATH. `docker build .` from the primary checkout builds `main`,
# not the worktree the change lives in — an hour lost to photographing code
# nobody had written yet.
docker build -q -t adestia-bench-app:latest "$root" >/dev/null
docker build -q -t adestia-bench-browser:latest "$root/bench" >/dev/null

docker network create adestia-bench >/dev/null 2>&1 || true
volumes=""
for spec in $mounts; do volumes="$volumes -v $spec"; done

# $volumes unquoted on purpose: each word is one `-v` and its argument. A
# scratch path with a space in it is not a case this bench has.
# shellcheck disable=SC2086
docker run -d --name adestia-bench-app --network adestia-bench \
  -v "$data:/data" $volumes adestia-bench-app:latest >/dev/null

# The image's own healthcheck is the readiness signal — no sleep to tune.
until [ "$(docker inspect -f '{{.State.Health.Status}}' adestia-bench-app)" = healthy ]; do
  sleep 1
done

docker run --rm --network adestia-bench \
  -v "$root/bench:/bench" -v "$root/$shots:/shots" -v "$data:/data" \
  adestia-bench-browser:latest node /bench/bench.mjs "/bench/${scenario#bench/}"

echo "shots in $shots"
