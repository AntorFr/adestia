#!/bin/sh
# Ce dont le scénario `journal-edition` a besoin avant le boot : un journal
# avec trois entrées déjà écrites, chacune portant plusieurs blocs — un titre,
# des paragraphes, une liste. Le défaut rapporté est « ✎ ouvre une zone vide et
# le contenu reste dessous » : il faut donc du contenu à perdre de vue.
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

cat >"$pages/2026-09-08-1730.md" <<'MD'
---
type: entree
date: 2026-09-08T17:30
title: Le gabarit de queues droites
---

## Ce qui a marché

Le gabarit tient enfin d'équerre. La cale de 8 mm était la bonne, et
c'est elle qui manquait depuis le début.

- Rainure de guidage à 12 mm, pas 10.
- Serrage par deux presses, jamais une seule.
- Passe de finition à la main, toujours.

Reste à refaire la butée arrière, qui bouge d'un demi-millimètre.
MD

cat >"$pages/2026-09-05-0915.md" <<'MD'
---
type: entree
date: 2026-09-05T09:15
title: Affûtage
---

Pierre 1000 puis 6000. Le ciseau de 25 coupe le papier sans forcer, ce
qui est le seul test que je garde.

Le dos n'est toujours pas plat sur les deux derniers centimètres.
MD

cat >"$pages/2026-08-30-1400.md" <<'MD'
---
type: entree
date: 2026-08-30T14:00
title: Débit du chêne
---

Quatre plateaux débités, deux réservés pour le plateau de la table.
Le reste part en chutes utiles.
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
