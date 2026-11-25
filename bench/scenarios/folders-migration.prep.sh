#!/bin/sh
# An instance in the OLD folder format, for `folders-migration`: settings carried by pages.
#   voyages/INDEX.md     title, ico, couleur, app + an extra field and a text
#   maison/maison.md     homonymous page: title, ico, couleur; a PDF sits in the folder
#   atelier/index.md     lower case, `ico` only
#   projets/INDEX.md     `title` only
#   cuisine/             no settings at all (an ordinary page)
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory"

page() {
  file=$1
  shift
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$@" >"$file"
}

page "$w/voyages/INDEX.md" '---' 'title: Voyages' 'ico: ✈️' 'couleur: turquoise' 'app: voyages' 'tags: [carnet]' '---' '' 'Tout ce qui se prépare avant de partir.'
page "$w/voyages/japon.md" '---' 'title: Japon' '---' '' 'Avril, deux semaines.'
page "$w/maison/maison.md" '---' 'title: Maison' 'ico: 🏠' 'couleur: vert' '---' '' 'Les papiers de la maison.'
printf '%%PDF-1.4 facture\n' >"$w/maison/facture.pdf"
page "$w/atelier/index.md" '---' 'ico: 🔧' '---' '' 'Le coin bricolage.'
page "$w/projets/INDEX.md" '---' 'title: Projets' '---' '' 'Ce qui est en cours.'
page "$w/cuisine/recette.md" '---' 'title: Gratin' '---' '' 'Pommes de terre, crème.'

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
  apps: []
  features: []
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/workspace:/workspace"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
