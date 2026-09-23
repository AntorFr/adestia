#!/bin/sh
# Ce dont le scénario `fil-ariane-fiche` a besoin avant le boot : un dossier
# qui s'ouvre SUR SA FICHE, et un voisin qui ne s'ouvre pas dessus.
#
# `chantiers/` déclare le plugin `project-management`, et `chantiers/cuisine/`
# ne tient qu'une seule page de ce type — donc le dossier EST la fiche et son
# adresse est celle du dossier. C'est exactement la situation où le fil
# d'Ariane écrivait le titre deux fois, la première copie renvoyant à l'écran
# déjà ouvert.
#
# Le voisin `devis.md` est là pour la contre-épreuve : depuis une page ordinaire
# du même dossier, le chantier au-dessus reste une vraie marche, et un vrai
# retour. Une correction qui supprimerait la marche dans les deux cas serait
# invisible sans lui.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory"
mkdir -p "$w/chantiers/cuisine"

cat >"$w/chantiers/INDEX.md" <<'MD'
---
title: Chantiers
ico: 🏗
app: project-management
---

# Chantiers

Ce qui est en cours, un dossier par chantier.
MD

# La fiche homonyme du dossier : `cuisine/cuisine.md`. C'est la convention
# « espace » — le dossier et sa page portent le même nom — et c'est elle qui
# rendait les deux copies du titre strictement identiques à l'écran.
cat >"$w/chantiers/cuisine/cuisine.md" <<'MD'
---
title: Rénovation de la cuisine
type: project-management
ico: 🍳
start: 2026-09-01
due: 2026-12-15
---

# Rénovation de la cuisine

Dépose, plomberie, électricité, pose. Le devis est à côté.
MD

cat >"$w/chantiers/cuisine/devis.md" <<'MD'
---
title: Devis
---

# Devis

Trois artisans, trois chiffres.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Chantiers
locale: fr
auth:
  mode: none
driver:
  id: claude-code
workspace:
  root: /workspace
  pages: memory
extensions:
  # Une feature : aucune tuile, aucun écran à elle. Le dossier la réclame par
  # `app:` dans son index, ce qui est le seul chemin par lequel un plugin sans
  # nom de dossier peut posséder `chantiers/`.
  features: [project-management]
  skin: default
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
