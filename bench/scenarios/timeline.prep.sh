#!/bin/sh
# Le premier bloc d'un plugin `feature` qui dessine dans une page : `:::timeline`.
#
# Le point du banc : des barres positionnées en pourcentages, un trait
# d'aujourd'hui, des jalons dont l'étiquette dépasse au-dessus — tout ça est
# de la géométrie que les tests ne regardent pas. Et les trois honnêtetés du
# bloc doivent se VOIR : la ligne illisible nommée sous le dessin, le bloc
# vide qui montre la grammaire, la phase courante qui se distingue.
set -eu

stage=$1
w="$stage/workspace"
mkdir -p "$w/memory/chantiers/adestia"

cat >"$w/memory/chantiers/INDEX.md" <<'MD'
---
title: Chantiers
---

# Chantiers
MD

cat >"$w/memory/chantiers/adestia/INDEX.md" <<'MD'
---
title: Adestia v1
type: projet
status: en cours
---

# Adestia v1

Le planning du chantier, rédigé dans le bloc — une ligne à deux dates est une
phase, une ligne à une date est un jalon.

:::timeline
- Cadrage: 2026-07-01 → 2026-08-15
- Réalisation: 2026-08-01 → 2026-09-30
- Recette: 2026-09-20 → 2026-10-15
- Revue de mi-parcours: 2026-08-20
- v1.0: 2026-09-12
- Sortie mobile: bientôt
:::

Le sprint en cours, à la semaine :

:::timeline{scale=weeks}
- Éditeur de blocs: 2026-09-07 → 2026-09-18
- Démo: 2026-09-16
:::

Et un bloc dont aucune ligne ne porte de date lisible — il doit montrer la
grammaire ET rendre les lignes par leur nom, jamais un axe autour de rien :

:::timeline
- Sortie mobile: à caler
- Idées en vrac
:::

## En blocs, pas en colonne

:::content{type=perimetre title="Périmètre" ico=📐 view=cards w=1/2}
Le socle de contenu et son shell. Hors infra, hors déploiement — et c'est ce
qui rend la v1.0 tenable.
:::

:::content{type=risque title="L'aléa connu" ico=⚠️ view=cards w=1/2}
Le contrat de session du CLI a déjà bougé une fois. Un test de contrat casse
le build avant la mise en production.
:::

:::callout{type=warning}
Un aparté, à côté : filet à gauche, fond teinté, ni sujet ni signature. C'est
ce qui le sépare d'une section encadrée.
:::

## Les rôles

Écrits, pas dérivés : personne ne calcule qui est PM. C'est une LISTE quand
même, pas de la prose.

:::list{view=chips}
- PM: Antor Berard
- IT PM: Nestor
- BA: Machine Truc
:::

## Les sous-chantiers, en cartes

:::list{depth=children view=cards pull=status}
:::

## Le planning consolidé

Rien de ressaisi : une barre par sous-chantier, lue dans leurs entêtes. Le
socle est clos — il doit se voir fini malgré ses dates. La sortie mobile est
échue et toujours ouverte : c'est un retard, et ça doit se voir. Les
permissions ont un `start:` après leur `due:` : illisible, donc nommée
dessous.

:::timeline{depth=subtree source=children}
:::
MD

mkdir -p "$w/memory/chantiers/adestia/socle" "$w/memory/chantiers/adestia/editeur" \
  "$w/memory/chantiers/adestia/permissions" "$w/memory/chantiers/adestia/mobile"

cat >"$w/memory/chantiers/adestia/socle/INDEX.md" <<'MD'
---
title: Socle de contenu
type: chantier
status: clos
start: 2026-07-01
due: 2026-08-20
---

# Socle de contenu
MD

cat >"$w/memory/chantiers/adestia/editeur/INDEX.md" <<'MD'
---
title: Éditeur de blocs
type: chantier
status: en cours
start: 2026-08-10
due: 2026-09-30
---

# Éditeur de blocs
MD

cat >"$w/memory/chantiers/adestia/permissions/INDEX.md" <<'MD'
---
title: Permissions
type: chantier
status: en cours
start: 2026-10-01
due: 2026-09-15
---

# Permissions
MD

cat >"$w/memory/chantiers/adestia/mobile/INDEX.md" <<'MD'
---
title: Sortie mobile
type: chantier
status: en cours
start: 2026-07-15
due: 2026-08-31
---

# Sortie mobile
MD

cat >"$w/memory/chantiers/adestia/v1.md" <<'MD'
---
title: v1.0
type: jalon
due: 2026-09-25
---

# v1.0
MD

cat >"$w/memory/chantiers/adestia/note.md" <<'MD'
---
title: Note de lecture
---

Une page sans date : elle ne doit apparaître nulle part sur le planning.
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
  planif: planning
extensions:
  apps: []
  features: [project-management]
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
