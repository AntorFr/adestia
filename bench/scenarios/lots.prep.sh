#!/bin/sh
# What the `lots` scenario needs before the image boots: two repositories to
# read, and a config that turns the plugin on and points it at them.
#
# Real repositories, built here and thrown away with the rest of the run —
# the plugin reads `git show`, not files, so a folder of markdown would test
# nothing. Between them they carry every shape the screen has to survive: an
# open question freezing a chain, a lot in flight whose BRANCH is fresher than
# main, a question invented at that branch tip, a merged branch that no longer
# exists, a cross-repository dependency, and one fiche with a broken status.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
export GIT_AUTHOR_NAME=Bench GIT_AUTHOR_EMAIL=bench@example.org
export GIT_COMMITTER_NAME=Bench GIT_COMMITTER_EMAIL=bench@example.org

fiche() {
  path=$1
  shift
  mkdir -p "$(dirname "$path")"
  {
    echo '---'
    for line in "$@"; do echo "$line"; done
    echo '---'
  } >"$path"
}

commit() {
  git -C "$1" add -- .agent >/dev/null
  git -C "$1" commit -q -m "$2"
}

# ── tessera ────────────────────────────────────────────────────────────────
t="$stage/tessera"
mkdir -p "$t"
git -C "$t" init -q -b main
fiche "$t/.agent/lots/README.md" 'not: a fiche'
fiche "$t/.agent/lots/tessera-0.md" \
  'id: tessera-0' 'type: lot' 'title: "Fondations"' 'status: done' \
  'depends_on: []' 'spec: CONCEPTION.md' 'branch: lot0' 'updated: 2026-08-27'
fiche "$t/.agent/lots/tessera-1.md" \
  'id: tessera-1' 'type: lot' 'title: "Le protocole et ses deux moitiés"' \
  'status: code' 'priority: 1' 'depends_on: [tessera-0]' 'spec: docs/protocol.md' \
  'branch: lot1' 'updated: 2026-08-28'
fiche "$t/.agent/lots/tessera-2.md" \
  'id: tessera-2' 'type: lot' 'title: "Cas 1 — repo_tag de bout en bout"' \
  'status: idea' 'priority: 2' 'depends_on: [tessera-1]' 'spec: CONCEPTION.md' \
  'branch: null' 'updated: 2026-08-29'
fiche "$t/.agent/lots/tessera-5.md" \
  'id: tessera-5' 'type: lot' 'title: "Matrice + catalogue, dans Ostia"' \
  'status: idea' 'priority: 4' 'depends_on: [ostia-q-selectors]' \
  'branch: null' 'updated: 2026-08-29'
fiche "$t/.agent/lots/tessera-9.md" \
  'id: tessera-9' 'type: lot' 'title: "Une fiche que personne n’a relue"' \
  'status: en-cours' 'branch: null' 'updated: 2026-08-30'
commit "$t" 'Open the tessera lots'

# lot0 is merged and gone: its fiche still names the branch, and that is the
# normal end of a lot rather than a fault.
git -C "$t" checkout -q -b lot1
fiche "$t/.agent/lots/tessera-1.md" \
  'id: tessera-1' 'type: lot' 'title: "Le protocole et ses deux moitiés"' \
  'status: design' 'priority: 1' 'depends_on: [tessera-0, tessera-q-cadre]' \
  'spec: docs/protocol.md' 'branch: lot1' 'updated: 2026-08-30'
cat >>"$t/.agent/lots/tessera-1.md" <<'PROSE'

## 2026-08-30 — renvoi en conception

Le protocole ne dit pas qui arbitre quand les deux moitiés répondent. Je ne
peux pas trancher ça depuis le code : question ouverte, lot repassé en design.
PROSE
fiche "$t/.agent/lots/tessera-q-cadre.md" \
  'id: tessera-q-cadre' 'type: question' \
  'title: "Qui arbitre quand les deux moitiés répondent ?"' 'status: open' \
  'depends_on: []' 'spec: docs/protocol.md' 'branch: null' 'updated: 2026-08-30'
commit "$t" 'Hand lot 1 back to design and raise the question that froze it'
git -C "$t" checkout -q main

# ── ostia ──────────────────────────────────────────────────────────────────
o="$stage/ostia"
mkdir -p "$o"
git -C "$o" init -q -b main
fiche "$o/.agent/lots/ostia-a.md" \
  'id: ostia-a' 'type: lot' 'title: "Une seule lecture du fil MCP"' \
  'status: done' 'depends_on: []' 'branch: lot-a' 'updated: 2026-08-29'
fiche "$o/.agent/lots/ostia-d.md" \
  'id: ostia-d' 'type: lot' 'title: "Flux 3 & 4 — catalogue observé"' \
  'status: design' 'priority: 3' 'depends_on: [ostia-q-fleet-protocol]' \
  'branch: null' 'updated: 2026-08-29'
fiche "$o/.agent/lots/ostia-enrollment.md" \
  'id: ostia-enrollment' 'type: lot' 'title: "Enrôlement en deux temps"' \
  'status: idea' 'priority: 5' 'depends_on: [ostia-d]' \
  'branch: null' 'updated: 2026-08-29'
fiche "$o/.agent/lots/ostia-oidc-gate.md" \
  'id: ostia-oidc-gate' 'type: lot' 'title: "Porte 1 (OIDC)"' \
  'status: integrate' 'priority: 4' 'depends_on: []' \
  'branch: null' 'updated: 2026-08-30'
fiche "$o/.agent/lots/ostia-q-fleet-protocol.md" \
  'id: ostia-q-fleet-protocol' 'type: question' \
  'title: "Ratifier le protocole de la boucle de flotte"' 'status: open' \
  'depends_on: []' 'spec: docs/design/decisions.md' 'branch: null' 'updated: 2026-08-29'
fiche "$o/.agent/lots/ostia-q-selectors.md" \
  'id: ostia-q-selectors' 'type: question' \
  'title: "Sémantique des sélecteurs — arbitrages Tier 1"' 'status: open' \
  'depends_on: []' 'spec: docs/design/decisions.md' 'branch: null' 'updated: 2026-08-29'
commit "$o" 'Open the ostia lots'

# ── the instance ───────────────────────────────────────────────────────────
cat >"$stage/adestia.config.yaml" <<'YAML'
name: Galaxie
locale: fr
auth:
  mode: none
driver:
  id: claude-code
secrets:
  LOTS_REPOS: /repos/tessera:/repos/ostia
extensions:
  apps: [lots]
  skin: default
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/tessera:/repos/tessera:ro"
echo "$stage/ostia:/repos/ostia:ro"
