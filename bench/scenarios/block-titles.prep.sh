#!/bin/sh
# Un titre et une icône sur chaque sorte de bloc, pour regarder où ils SE
# POSENT.
#
# Le point du banc : `title=` et `ico=` sont réservés, et le lecteur dessine
# l'en-tête pour tous — dans la boîte d'une liste, dans un encadré, au-dessus
# du reste. Un test dit qu'il y a un titre ; il ne dit pas si la liste titrée
# et la carte à côté d'elle ont leurs titres sur la même ligne, ni si une
# pastille teintée disparaît dans un encadré teinté.
#
# Imprime ses volumes sur stdout, un `src:dst[:ro]` par ligne. Voir `run.sh`.
set -eu

stage=$1
w="$stage/workspace/memory/domaines/diy/projets/servante"
mkdir -p "$w"

cat >"$w/INDEX.md" <<'MD'
---
title: Servante d'atelier sur roulettes
type: projet
status: en cours
---

# Servante d'atelier sur roulettes

:::figures{title="En chiffres" ico=📊}
- Pièces: 9 — 2 plaques
- Hauteur: 1000 mm — plan affleurant
- Chute: 11 % — sur P2
:::

:::list{title="Sous-projets" ico=🧱 w=2/3}
:::

:::content{type=perimetre title="Périmètre" ico=📐 w=1/3 view=cards}
Le caisson, ses tablettes et le plateau.
:::

:::list{title="Qui fait quoi" view=chips}
- Conception: Alfred
- Coupe: Monsieur
:::

:::table{title="Liste de débit" ico=🪚}
| Étiquette | Rôle | Largeur (mm) | Longueur (mm) | Ép. |
|---|---|---|---|---|
| SRV-CÔTÉ-G | Côté gauche | 668 | 721 | 19 |
| SRV-BAS | Bas traversant | 722 | 671 | 19 |
:::

:::callout{type=warning title="Avant la coupe" ico=⚠️}
Le bas se chante sur ses quatre bords.
:::

:::figures
- Sans titre: 1 — un bloc qui ne demande rien reste nu
:::
MD

cat >"$w/plateau.md" <<'MD'
---
title: Plateau MDF du stock
status: en cours
---

Le plateau.
MD
cat >"$w/roulettes.md" <<'MD'
---
title: Roulettes à frein
status: en cours
---

Quatre.
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
  apps: []
  features: []
  skin: alfred
YAML

chmod -R a+rX "$stage"
echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
