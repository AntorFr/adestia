#!/bin/sh
# Une collection dessinée par le cœur — ce que le test ne dit pas : si les
# facettes se lisent comme des cartes, si le repli des choses finies se
# distingue, si la fiche garde ses propres mots au-dessus de la grille.
set -eu

stage=$1
w="$stage/workspace/memory"

page() {
  file=$1
  shift
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$@" >"$file"
}

page "$w/diy/INDEX.md" '---' 'title: Bricolage' 'type: index' 'ico: 🔧' '---' '' 'Ce qui se fabrique à la maison.'
page "$w/diy/projets.md" '---' 'title: Projets' 'type: collection' 'ico: 🗂' 'of: projet' 'groupBy: cat' \
  'labels: menuiserie=Menuiserie, electronique=Électronique' 'into: diy/projets' '---' '' \
  'Les chantiers en cours, rangés par métier principal.'
page "$w/diy/projets/garage.md" '---' 'title: Rangement du garage' 'type: projet' 'cat: menuiserie' 'status: en-cours' '---' '' 'Des étagères le long du mur nord.'
page "$w/diy/projets/etagere.md" '---' 'title: Étagère du salon' 'type: projet' 'cat: menuiserie' 'status: a-faire' '---' '' 'Chêne, trois planches.'
page "$w/diy/projets/capteur.md" '---' 'title: Capteur de pluie' 'type: projet' 'cat: electronique' 'status: en-cours' '---' '' 'Un ESP32 sous la gouttière.'
page "$w/diy/projets/lampe.md" '---' 'title: Lampe de chevet' 'type: projet' '---' '' 'Pas encore rangée dans un métier.'
page "$w/diy/projets/terrasse.md" '---' 'title: Terrasse' 'type: projet' 'cat: menuiserie' 'status: clos' '---' '' 'Posée en juin.'

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
