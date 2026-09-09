#!/bin/sh
# Une entrée par bloc du cœur, plus un témoin sans bloc du tout.
#
# `adestiaVocabulary()` déclare un nœud d'éditeur pour `callout`, `gallery` et
# `app`, et rien pour les quatre renderings ajoutés au cœur le 2026-09-09
# (`content`, `figures`, `table`, `list`). Son propre commentaire annonce la
# panne : « Milkdown throws "cannot match target parser" on a document the
# reader renders perfectly ». Reste à voir ce que ça DONNE à l'écran.
set -eu

stage=$1
pages="$stage/workspace/pages/journal/atelier"
mkdir -p "$pages"

cat >"$pages/INDEX.md" <<'MD'
---
title: Atelier
type: journal
ico: 🪵
---
MD

# 1 — témoin : rien que de la prose. Doit s'éditer.
cat >"$pages/2026-09-01-0800.md" <<'MD'
---
type: entree
date: 2026-09-01T08:00
title: Temoin sans bloc
---

Rien que de la prose, pour avoir une entrée dont on sait qu'elle marche.
MD

# 2 — callout : bloc du cœur, nœud d'éditeur DÉCLARÉ. Doit s'éditer.
cat >"$pages/2026-09-02-0800.md" <<'MD'
---
type: entree
date: 2026-09-02T08:00
title: Avec un callout
---

:::callout{ton="info"}
Le gabarit est rangé au fond, derrière la scie.
:::

Une phrase après le bloc.
MD

# 3 — content : bloc du cœur, AUCUN nœud d'éditeur.
cat >"$pages/2026-09-03-0800.md" <<'MD'
---
type: entree
date: 2026-09-03T08:00
title: Avec un content
---

:::content{type="Bilan"}
Quatre plateaux débités, deux réservés.
:::

Une phrase après le bloc.
MD

# 4 — figures : idem.
cat >"$pages/2026-09-04-0800.md" <<'MD'
---
type: entree
date: 2026-09-04T08:00
title: Avec des figures
---

:::figures
- Avancement: 62 % — 8 lots sur 13
- Chutes: 14 kg
:::

Une phrase après le bloc.
MD

# 5 — table : idem.
cat >"$pages/2026-09-05-0800.md" <<'MD'
---
type: entree
date: 2026-09-05T08:00
title: Avec une table
---

:::table{type="Risques"}
| Niveau | Quoi |
| --- | --- |
| moyen | La butée arrière bouge |
| levé | La cale de 8 mm |
:::

Une phrase après le bloc.
MD

# 6 — list : idem, et sans corps.
cat >"$pages/2026-09-06-0800.md" <<'MD'
---
type: entree
date: 2026-09-06T08:00
title: Avec une list
---

:::list{from="children"}
:::

Une phrase après le bloc.
MD

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Atelier
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [journal]
  skin: default
YAML

chmod -R a+rwX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
