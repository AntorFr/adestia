#!/bin/sh
# Boot the real image, look at it through a real browser, tear it all down.
#
#   bench/run.sh [scenario] [out]
#
# Defaults to `bench/scenarios/turn-parts.mjs`, writing PNGs to `bench/shots/`.
# Everything it creates is named `demeura-bench-*` and removed on the way out;
# the app's data lives in a throwaway directory, never in `./data`.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
scenario=${1:-bench/scenarios/turn-parts.mjs}
shots=${2:-bench/shots}
data=$(mktemp -d)
mkdir -p "$root/$shots"
chmod 777 "$data" "$root/$shots"

cleanup() {
  docker rm -f demeura-bench-app >/dev/null 2>&1 || true
  docker network rm demeura-bench >/dev/null 2>&1 || true
  rm -rf "$data"
}
trap cleanup EXIT

# By explicit PATH. `docker build .` from the primary checkout builds `main`,
# not the worktree the change lives in — an hour lost to photographing code
# nobody had written yet.
docker build -q -t demeura-bench-app:latest "$root" >/dev/null
docker build -q -t demeura-bench-browser:latest "$root/bench" >/dev/null

docker network create demeura-bench >/dev/null 2>&1 || true
docker run -d --name demeura-bench-app --network demeura-bench \
  -v "$data:/data" demeura-bench-app:latest >/dev/null

# The image's own healthcheck is the readiness signal — no sleep to tune.
until [ "$(docker inspect -f '{{.State.Health.Status}}' demeura-bench-app)" = healthy ]; do
  sleep 1
done

docker run --rm --network demeura-bench \
  -v "$root/bench:/bench" -v "$root/$shots:/shots" -v "$data:/data" \
  demeura-bench-browser:latest node /bench/bench.mjs "/bench/${scenario#bench/}"

echo "shots in $shots"
