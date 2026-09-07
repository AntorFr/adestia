#!/bin/sh
# What the `meals` scenario needs before the image boots: two periods that are
# the SAME screen used two ways, and a config that turns the feature on.
#
# Both are PAGES — `type: meals` — filed in two unrelated folders, which is the
# claim to look at: a period is an ordinary page of the memory, so it lives
# wherever its subject lives (a trip, a health carnet) and needs no domain of
# its own. Their frontmatter carries the shape; the `.meals.json` beside them
# carries only the cards.
#
# The point of seeding both is the claim the plugin makes. A week of holiday
# menus and a fortnight of what somebody actually ate share one file format,
# one frise and one tray — there is no mode field anywhere — and if that is
# wrong it is wrong on screen, in how the two look side by side, long before a
# test could say so.
#
# So: a trip's fiche carrying its week (ingredients in `props`, servings in
# `quantite`), a health page carrying a log (nutrients in `props`, grams in
# `quantite`, and a `goûter` section this file declares for itself), and one
# page citing a period in the compact form.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
w="$stage/workspace"

page() {
  path="$w/memory/$1"
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

json() {
  path="$w/memory/$1"
  mkdir -p "$(dirname "$path")"
  cat >"$path"
}

# ── the holiday week, on a trip's fiche ────────────────────────────────────
page 'voyages/corse/semaine.md' <<'MD'
---
title: Corse — la semaine
type: meals
ico: 🍽
debut: 2026-08-08
fin: 2026-08-12
sections: [matin, midi, soir]
---

On cale les dîners d'abord, le reste suit. Les courses se font le dimanche.
MD

json 'voyages/corse/assets/semaine.meals.json' <<'JSON'
{
  "version": 1,
  "items": [
    { "id": "cafe-1", "titre": "Café et pain frais", "ico": "☕",
      "statut": "confirme", "jour": "2026-08-08", "section": "matin", "ordre": 1,
      "quantite": "pour 4",
      "props": { "pain": "2 baguettes", "confiture de figue": "1 pot" } },
    { "id": "salade", "titre": "Salade de tomates et brocciu", "ico": "🥗",
      "statut": "confirme", "jour": "2026-08-08", "section": "midi", "ordre": 1,
      "quantite": "pour 4",
      "desc": "Le brocciu se trouve au marché de Calvi le samedi matin, pas après.",
      "props": { "tomates": "1 kg", "brocciu": "400 g", "basilic": "1 botte", "huile d'olive": "" } },
    { "id": "burrata", "titre": "Pâtes à la burrata", "ico": "🍝",
      "statut": "confirme", "jour": "2026-08-08", "section": "soir", "ordre": 1,
      "quantite": "pour 4",
      "desc": "Le classique du premier soir : rien à cuire que les pâtes, et la voiture est encore pleine.",
      "props": { "pâtes": "500 g", "burrata": "2 boules", "tomates cerises": "250 g", "pignons": "50 g" } },
    { "id": "restes", "titre": "Restes + melon", "ico": "🍈",
      "statut": "confirme", "jour": "2026-08-09", "section": "midi", "ordre": 1,
      "quantite": "pour 4" },
    { "id": "grillades", "titre": "Grillades sur la terrasse", "ico": "🔥",
      "statut": "confirme", "jour": "2026-08-09", "section": "soir", "ordre": 1,
      "quantite": "pour 6",
      "desc": "Les voisins montent vers 20 h. Prévoir large, ils apportent le vin.",
      "props": { "côtes d'agneau": "12", "aubergines": "4", "charbon": "1 sac" } },
    { "id": "plage", "titre": "Sandwichs à la plage", "ico": "🥖",
      "statut": "confirme", "jour": "2026-08-10", "section": "midi", "ordre": 1,
      "quantite": "pour 4",
      "props": { "pain": "2 baguettes", "figatellu": "300 g", "tomme corse": "250 g" } },
    { "id": "poulet-citron", "titre": "Poulet au citron", "ico": "🍋",
      "statut": "suggestion",
      "hint": "Se fait pendant qu'on est à la plage",
      "desc": "Deux heures au four à basse température : on le lance avant de partir et il attend.",
      "props": { "cuisses de poulet": "8", "citrons": "3", "thym": "1 bouquet" } },
    { "id": "soupe-corse", "titre": "Soupe corse", "ico": "🥣",
      "statut": "suggestion",
      "hint": "Pour le soir où il pleut",
      "props": { "haricots secs": "400 g", "lard": "200 g", "chou": "1" } },
    { "id": "aubergines", "titre": "Aubergines à la bonifacienne", "ico": "🍆",
      "statut": "suggestion",
      "hint": "Long, mais c'est LE plat du coin",
      "props": { "aubergines": "8", "brocciu": "300 g", "coulis": "500 g" } },
    { "id": "pizza", "titre": "Pizza du camion", "ico": "🍕",
      "statut": "ecartee",
      "hint": "Le camion ne passe plus cet été" }
  ]
}
JSON

# ── the fortnight of what was actually eaten ───────────────────────────────
# Same format, same screen. Four sections rather than three, because the
# snack at four o'clock is exactly what a log exists to catch.
page 'sante/semaine-type.md' <<'MD'
---
title: Semaine type — septembre
type: meals
ico: 📊
debut: 2026-09-01
fin: 2026-09-04
sections: [matin, midi, goûter, soir]
data: assets/septembre.meals.json
---

Deux semaines pesées, pour avoir de quoi en parler. Je scanne quand il y a un
code-barres, je pèse sinon.
MD

json 'sante/assets/septembre.meals.json' <<'JSON'
{
  "version": 1,
  "items": [
    { "id": "yaourt", "titre": "Yaourt nature Malo", "ico": "🥛",
      "statut": "confirme", "jour": "2026-09-01", "section": "matin", "ordre": 1,
      "quantite": "125 g", "source": "cab:3033610060529",
      "props": { "énergie": "72 kcal", "protéines": "4,1 g", "glucides": "5,3 g", "dont sucres": "5,3 g", "lipides": "3,8 g", "sel": "0,06 g" } },
    { "id": "cafe", "titre": "Café noir", "ico": "☕",
      "statut": "confirme", "jour": "2026-09-01", "section": "matin", "ordre": 2,
      "quantite": "2 tasses",
      "props": { "énergie": "4 kcal" } },
    { "id": "riz-poulet", "titre": "Riz, poulet, courgettes", "ico": "🍚",
      "statut": "confirme", "jour": "2026-09-01", "section": "midi", "ordre": 1,
      "quantite": "environ 420 g",
      "desc": "Pesé au bol : 180 g de riz cuit, 150 g de blanc de poulet, le reste en courgettes.",
      "props": { "énergie": "540 kcal", "protéines": "44 g", "glucides": "58 g", "lipides": "9 g", "fibres": "4 g", "sel": "1,1 g" } },
    { "id": "cookie", "titre": "Cookie du distributeur", "ico": "🍪",
      "statut": "confirme", "jour": "2026-09-01", "section": "goûter", "ordre": 1,
      "quantite": "45 g", "source": "cab:7622210449283",
      "desc": "Celui de 16 h au bureau. Noté parce qu'il compte, justement.",
      "props": { "énergie": "212 kcal", "protéines": "2,6 g", "glucides": "28 g", "dont sucres": "17 g", "lipides": "10 g", "sel": "0,32 g" } },
    { "id": "soupe", "titre": "Soupe de légumes maison", "ico": "🥣",
      "statut": "confirme", "jour": "2026-09-01", "section": "soir", "ordre": 1,
      "quantite": "350 ml",
      "props": { "énergie": "120 kcal", "protéines": "4 g", "glucides": "18 g", "fibres": "6 g", "sel": "0,9 g" } },
    { "id": "pain-fromage", "titre": "Pain et comté", "ico": "🧀",
      "statut": "confirme", "jour": "2026-09-01", "section": "soir", "ordre": 2,
      "quantite": "60 g + 40 g",
      "props": { "énergie": "310 kcal", "protéines": "14 g", "lipides": "16 g", "sel": "1,4 g" } },
    { "id": "porridge", "titre": "Porridge avoine-banane", "ico": "🥣",
      "statut": "confirme", "jour": "2026-09-02", "section": "matin", "ordre": 1,
      "quantite": "300 g",
      "props": { "énergie": "340 kcal", "protéines": "11 g", "glucides": "52 g", "fibres": "7 g" } },
    { "id": "cantine", "titre": "Cantine — poisson pané, purée", "ico": "🐟",
      "statut": "confirme", "jour": "2026-09-02", "section": "midi", "ordre": 1,
      "quantite": "estimé, non pesé",
      "desc": "Rien de pesé ici : à traiter comme un ordre de grandeur, pas comme une mesure.",
      "props": { "énergie": "~700 kcal", "sel": "~2 g" } },
    { "id": "pomme", "titre": "Pomme", "ico": "🍎",
      "statut": "confirme", "jour": "2026-09-02", "section": "goûter", "ordre": 1,
      "quantite": "180 g",
      "props": { "énergie": "94 kcal", "glucides": "22 g", "fibres": "4 g" } },
    { "id": "habitude-oeufs", "titre": "Œufs brouillés", "ico": "🍳",
      "statut": "suggestion", "hint": "Le matin quand il reste du temps",
      "quantite": "2 œufs",
      "props": { "énergie": "180 kcal", "protéines": "13 g", "lipides": "14 g" } },
    { "id": "habitude-salade", "titre": "Salade complète du midi", "ico": "🥗",
      "statut": "suggestion", "hint": "Le midi par défaut",
      "quantite": "environ 400 g",
      "props": { "énergie": "420 kcal", "protéines": "22 g", "fibres": "9 g" } }
  ]
}
JSON

# ── the folder around it, so the period is seen IN a domain ────────────────
# The point of this page: a period is an ordinary page of the memory. It sits
# in a trip's folder, it is listed beside the trip's other fiches, and a plain
# link reaches it. Nothing about it needs the plugin to be findable.
page 'voyages/corse/INDEX.md' <<'MD'
---
title: Corse — été 2026
type: index
ico: 🌴
---

Le séjour se cale. Les repas ont leur propre page : [la semaine](semaine.md).

Le reste (ferry, maison, plages) est dans les fiches à côté.
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
  # A feature, not an app: no tile anywhere. A period is a PAGE, drawn by this
  # plugin because its `type` says so. Deliberately the only extension here —
  # a period must stand in an ordinary folder with no domain app around it.
  features: [meals]
  skin: default
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$w:/workspace"
