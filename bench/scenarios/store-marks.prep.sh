#!/bin/sh
# Les trois états d'un dossier, côte à côte sur un seul écran.
#
# Un dossier est l'unité dans laquelle on pense — un voyage, un projet — et la
# provenance n'était dessinée que sur les FICHES. Un voyage rangé dans le
# cercle partagé ressemblait donc exactement à un voyage rangé chez soi.
#
#   atelier/   entièrement dans le magasin par défaut  → AUCUNE marque
#   recettes/  entièrement dans le cercle familial     → la marque du cercle
#   voyages/   une moitié dans chacun                  → « mélangé »
set -eu

stage=$1
w="$stage/workspace"
f="$stage/famille"

page() {
  mkdir -p "$(dirname "$1")"
  { echo '---'; echo "title: $2"; echo "type: ${3:-fiche}"; echo '---'; echo; echo 'Contenu de démonstration.'; } >"$1"
}

# ── le mien : rien à signaler, et l'absence EST la marque ─────────────────
page "$w/memory/atelier/INDEX.md" 'Atelier' 'index'
page "$w/memory/atelier/etabli.md" 'Établi du fond' 'projet'
page "$w/memory/atelier/scie.md" 'Scie plongeante' 'fiche'

# ── entièrement partagé : la marque du cercle, comme une fiche ────────────
page "$f/recettes/lasagnes.md" 'Lasagnes du dimanche' 'fiche'
page "$f/recettes/tarte.md" 'Tarte aux pommes' 'fiche'

# ── mélangé : le voyage est partagé, mais le carnet est resté chez moi ────
page "$f/voyages/baden-2026/baden-2026.md" 'Baden 2026' 'voyage'
page "$f/voyages/baden-2026/vannes.md" 'Vannes à pied' 'fiche'
page "$w/memory/voyages/baden-2026/notes/carnet.md" 'Carnet de bord' 'fiche'

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
