#!/bin/sh
# `:::subproject` et le `project-status` : une note du PORTEUR, pas une date.
#
# Le point du banc, et il est en deux moitiés. La première est ordinaire :
# est-ce que trois familles de couleur se distinguent dans une colonne, et
# est-ce que la précédence se VOIT — un projet bloqué qui porte « nominal »
# doit dire « bloqué », et c'est le genre de chose qu'un test affirme mais que
# personne ne croit avant de l'avoir vue.
#
# La seconde est la vraie raison de ce banc : `BENCH_SKIN=skippy` rejoue tout
# sur un skin qui écrase les dix teintes nommées sur un seul ambre. Si les
# couleurs étaient passées par `--adestia-hue-*`, vert, ambre et rouge y
# seraient la même tache. Elles passent par `--danger` / `--warning` /
# `--success`, que Skippy garde distincts — cette photo est la preuve.
set -eu

stage=$1
w="$stage/workspace"
mkdir -p "$w/memory/chantiers/adestia/socle" "$w/memory/chantiers/adestia/editeur" \
  "$w/memory/chantiers/adestia/ask" "$w/memory/chantiers/adestia/infra" \
  "$w/memory/chantiers/adestia/mobile"

cat >"$w/memory/chantiers/INDEX.md" <<'MD'
---
title: Chantiers
app: project-management
---

# Chantiers
MD

cat >"$w/memory/chantiers/adestia/INDEX.md" <<'MD'
---
title: Adestia v1
type: project-management
status: en cours
project-status: Amber
---

# Adestia v1

:::subproject{title="Sous-projets" ico=◆}
:::

:::subproject{view=cards title="Les mêmes, en cartes"}
:::

:::timeline{depth=children title="Le planning des mêmes"}
:::
MD

# Un sous-projet par cas, et le troisième est celui qui compte : il porte une
# note ET un statut de cycle de vie qui l'emporte.
cat >"$w/memory/chantiers/adestia/socle/INDEX.md" <<'MD'
---
title: Socle de contenu
type: project-management
status: en cours
project-status: Green
start: 2026-08-01
due: 2026-10-30
---

# Socle de contenu
MD

cat >"$w/memory/chantiers/adestia/mobile/INDEX.md" <<'MD'
---
title: Sortie mobile
type: project-management
status: en cours
project-status: amber
start: 2026-09-01
due: 2026-11-15
---

# Sortie mobile

Écrit en minuscules à la main : la pastille doit quand même dire « Amber ».
Vingt lignes dont l'une dit « amber » et la suivante « Amber » ont l'air
cassées pour une raison que personne ne voit.
MD

cat >"$w/memory/chantiers/adestia/ask/INDEX.md" <<'MD'
---
title: Le mode ask
type: project-management
status: bloqué
project-status: Green
start: 2026-08-15
due: 2026-09-10
---

# Le mode ask

Il porte « Green » et il est bloqué : c'est la vie de la page qui parle.
MD

cat >"$w/memory/chantiers/adestia/infra/INDEX.md" <<'MD'
---
title: Bascule infra
type: project-management
status: en cours
project-status: Red
start: 2026-07-01
due: 2026-09-01
---

# Bascule infra

Sa date est passée : sans note, la barre serait « en retard ». Elle porte
« Red », et une affirmation l'emporte sur une déduction.
MD

cat >"$w/memory/chantiers/adestia/editeur/INDEX.md" <<'MD'
---
title: Éditeur de blocs
type: project-management
status: clos
project-status: Red
start: 2026-06-01
due: 2026-08-20
---

# Éditeur de blocs

Clos, avec une vieille note « Red » restée écrite : le repli doit le
prendre, et la pastille doit dire « clos ».
MD

cat >"$w/memory/chantiers/adestia/note.md" <<'MD'
---
title: Note de lecture
status: en cours
---

Une page rangée là, qui n'est pas un sous-projet : elle ne doit apparaître
dans aucun des deux blocs.
MD

cat >"$stage/adestia.config.yaml" <<YAML
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
  skin: ${BENCH_SKIN:-default}
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
