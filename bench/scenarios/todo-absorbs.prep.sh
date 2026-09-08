#!/bin/sh
# A French instance, whose tasks are therefore filed in `taches`.
#
# The whole point of the shot: `absorbs` used to declare `todo` alone, so on
# this instance — the only kind the owner runs — the tasks folder appeared as
# a SECTION beside the Todo tile that already stands for it. Two doors to one
# room, one of them always the wrong click.
#
# A second folder (`domaines`) is seeded so the home screen still has a real
# section to draw: a page proving "nothing is listed" on an instance with
# nothing to list would prove nothing at all.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace"

page() {
  path="$w/$1"
  mkdir -p "$(dirname "$path")"
  {
    echo '---'
    echo "title: $2"
    echo "type: ${3:-fiche}"
    [ -n "${4:-}" ] && echo "$4"
    echo '---'
    echo
    echo 'Contenu de démonstration.'
  } >"$path"
}

# ── taches : le dossier français par défaut, celui que la tuile représente ──
page 'memory/taches/poncer-porte.md' 'Poncer la porte du garage' 'tache' 'due: 2026-09-12'
page 'memory/taches/appeler-plombier.md' 'Appeler le plombier' 'tache' 'due: 2026-08-22'
page 'memory/taches/sortir-poubelles.md' 'Sortir les poubelles' 'tache' 'due: 2026-09-08'
page 'memory/taches/commander-charnieres.md' 'Commander les charnières' 'tache' 'done: 2026-09-05'

# ── une vraie section à côté, pour que l'accueil ait quelque chose à dire ──
page 'memory/domaines/diy/INDEX.md' "L'Atelier" 'index' 'ico: 🪚'
page 'memory/domaines/diy/etabli.md' "Établi — réglages" 'fiche'
page 'memory/domaines/maison/INDEX.md' 'Maison' 'index' 'ico: 🏠'
page 'memory/domaines/maison/chaudiere.md' 'Chaudière — entretien annuel' 'fiche'

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  pages: memory
  planif: planning
extensions:
  apps: [todo]
  skin: default
YAML

mkdir -p "$w/planning"
chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
