#!/bin/sh
# Un chantier et ses sous-chantiers, un statut de chaque famille.
#
# Le point du banc : la pastille est une COULEUR. Un test dit que la classe
# porte `--waiting` ; il ne dit pas si l'orange se distingue de l'accent dans
# une ligne, si la pastille tient sur la même ligne que l'étiquette neutre
# posée à côté, ni si les trois familles se lisent encore dans le sombre.
set -eu

stage=$1
w="$stage/workspace"
mkdir -p "$w/memory/chantiers/adestia/socle" "$w/memory/chantiers/adestia/editeur" \
  "$w/memory/chantiers/adestia/ask" "$w/memory/chantiers/adestia/infra"

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

:::list{depth=children pull=status,type title="Sous-chantiers" ico=◆}
:::

:::list{depth=children pull=status view=cards title="Les mêmes, en cartes"}
:::
MD

# Une famille par enfant : l'accent, l'orange, le vert. Et une page rangée là
# qui n'est pas un sous-chantier, pour que la liste n'ait pas l'air d'être une
# liste de tout ce qui traîne.
cat >"$w/memory/chantiers/adestia/socle/INDEX.md" <<'MD'
---
title: Socle de contenu
type: chantier
status: en cours
---

# Socle de contenu
MD

cat >"$w/memory/chantiers/adestia/ask/INDEX.md" <<'MD'
---
title: Le mode ask
type: chantier
status: bloqué
---

# Le mode ask
MD

cat >"$w/memory/chantiers/adestia/infra/INDEX.md" <<'MD'
---
title: Bascule infra
type: chantier
status: en attente
---

# Bascule infra
MD

cat >"$w/memory/chantiers/adestia/editeur/INDEX.md" <<'MD'
---
title: Éditeur de blocs
type: chantier
status: clos
---

# Éditeur de blocs
MD

cat >"$w/memory/chantiers/adestia/note.md" <<'MD'
---
title: Note de lecture
---

Une page rangée ici, qui n'est pas un sous-chantier.
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
  features: []
  skin: default
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
