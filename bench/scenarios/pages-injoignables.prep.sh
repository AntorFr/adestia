#!/bin/sh
# Les deux façons dont une page devenait introuvable, reproduites telles quelles.
#
# 1. Une adresse qui ne mène nulle part — ce que la coque affichait alors :
#    l'accueil, sans un mot. C'est ce qui a fait passer une adresse inventee
#    par un agent pour un lien casse.
# 2. Une periode de repas rangee dans un dossier `journal/`. L'app Journal
#    absorbe ce NOM partout ou il se trouve, donc le dossier lui revenait, la
#    tuile de section disparaissait, et la page n'etait joignable que par son
#    adresse directe.
set -eu

stage=$1
w="$stage/workspace"

page() {
  path="$w/memory/$1"
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

page 'sante/dietetique/journal/2026-09-07.md' <<'MD'
---
title: Repas — semaine du 7 septembre
type: meals
ico: 🍽
debut: 2026-09-07
fin: 2026-09-09
sections: [matin, midi, goûter, soir]
---

Journal réel de ce qui est mangé, semaine par semaine.
MD

mkdir -p "$w/memory/sante/dietetique/journal/assets"
cat >"$w/memory/sante/dietetique/journal/assets/2026-09-07.meals.json" <<'JSON'
{
  "version": 1,
  "items": [
    { "id": "the", "titre": "Thé au lait", "ico": "🍵", "statut": "confirme",
      "jour": "2026-09-07", "section": "matin", "quantite": "655 g",
      "props": { "énergie": "38 kcal" } }
  ]
}
JSON

page 'sante/dietetique/habitudes.md' <<'MD'
---
title: Habitudes
type: fiche
---

Une voisine, pour que le dossier ne tienne pas sur une page.
MD

# Un VRAI journal, celui que l'app tient pour de bon : il doit continuer a lui
# revenir, sinon le correctif aurait casse ce qu'il protege.
page 'journal/atelier/INDEX.md' <<'MD'
---
title: Carnet d'atelier
type: journal
---

Le journal que l'app connait.
MD

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
extensions:
  apps: [journal]
  features: [meals]
  skin: default
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
