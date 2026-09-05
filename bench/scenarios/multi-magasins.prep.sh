#!/bin/sh
# Deux cercles, dont un monté HORS de l'espace de travail.
#
# C'est le cas réel et pas une commodité de test : un magasin partagé vit sur
# son propre volume — un dataset que d'autres écrivent n'a rien à faire dans la
# maison de cette instance. Le monter ailleurs est ce qui exerce à la fois la
# déclaration au CLI et la résolution logique → disque.
#
# Le dossier `voyages` existe des DEUX côtés : à l'écran il n'y en a qu'un.
# Et `italie.md` existe des deux côtés aussi : à l'écran il y en a deux, dont
# une suffixée — cacher la perdante est un pire échec que la montrer deux fois.
set -eu

stage=$1
w="$stage/workspace"
f="$stage/famille"

page() {
  path="$1"
  mkdir -p "$(dirname "$path")"
  {
    echo '---'
    echo "title: $2"
    echo "type: ${3:-fiche}"
    [ -n "${4:-}" ] && echo "status: $4"
    echo '---'
    echo
    echo 'Contenu de démonstration.'
  } >"$path"
}

# ── le cercle perso : la mémoire de cette instance ────────────────────────
page "$w/memory/voyages/INDEX.md" 'Voyages' 'index' 'permanent'
page "$w/memory/voyages/lisbonne.md" 'Lisbonne, avril' 'voyage' 'en cours'
page "$w/memory/voyages/vercors.md" 'Week-end Vercors' 'voyage' 'à décider'
page "$w/memory/voyages/italie.md" 'Voyage Italie' 'voyage' 'en cours'
page "$w/memory/atelier/INDEX.md" 'Atelier' 'index' 'permanent'
page "$w/memory/atelier/etabli.md" 'Établi du fond' 'projet' 'en cours'

# ── le cercle familial : un autre volume, que d'autres écrivent ───────────
page "$f/voyages/baden.md" 'Baden 2026' 'voyage' 'réservé'
page "$f/voyages/corse.md" 'Corse, été' 'voyage' 'à décider'
# Le même nom des deux côtés : c'est le conflit, et il doit se voir.
page "$f/voyages/italie.md" 'Voyage Italie' 'voyage' 'réservé'

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Alfred
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  planif: planning
  stores:
    - id: perso
      path: memory
      label: Perso
      default: true
    - id: famille
      path: /famille
      label: Famille
      hue: violet
extensions:
  apps: []
  features: []
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
echo "$f:/famille"
