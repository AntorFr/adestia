---
name: json
description: >
  Le CONTRAT d'une période de repas — une page `type: meals` qui porte la forme, un
  `.meals.json` voisin qui porte les cartes, et DEUX outils pour l'écrire sans écraser
  ce que quelqu'un vient de glisser à l'écran. À consulter dès qu'on te demande de
  cadrer une période, d'y proposer des repas, ou de consigner ce qui a été mangé. Le
  métier — juger une semaine, dresser une liste de courses, convertir des unités —
  reste chez toi.
---

# Une période de repas

Une période est **une page**. `sante/septembre.md`, `type: meals` : elle vit dans le
dossier que tu veux (un voyage, un carnet de santé, une semaine de journal), elle est
indexée, cherchable, citable, et le shell la dessine en **frise** — un ascenseur jour
par jour, chaque jour découpé en sections, et un tray de cartes qu'on glisse.

```markdown
---
title: Semaine type — septembre
type: meals
ico: 📊
debut: 2026-09-01
fin: 2026-09-14
sections: [matin, midi, goûter, soir]
data: assets/septembre.meals.json
---

Deux semaines pesées, pour avoir de quoi en parler. Je scanne quand il y a un
code-barres, je pèse sinon.
```

**La page est l'autorité.** Elle porte la forme — les dates, les sections, où sont
rangées les cartes — et rien de tout ça n'est répété ailleurs. Corriger une date, c'est
éditer la page, dans l'éditeur habituel. Le `.meals.json` voisin ne porte **que** les
cartes :

```json
{ "version": 1, "items": [ … ] }
```

`data:` est optionnel : sans lui, c'est `assets/<nom de la page>.meals.json`. Il est
**relatif à la page**, comme une image, et ne peut pas sortir de son dossier.

## Un seul mécanisme, deux usages

Le même dispositif sert à **décider** ce qu'on va manger et à **consigner** ce qu'on a
mangé. Ce n'est pas un mode à déclarer, et il n'y a aucun champ pour le dire : dans les
deux cas il y a une période, des sections, des cartes calées et un tray. Ce qui change
est **ce que tu écris dedans**, pas la mécanique.

## ⚠️ N'écris JAMAIS le `.meals.json` avec un outil de fichier

Ce fichier a **deux auteurs** : toi, et l'écran où quelqu'un glisse des cartes. Rien ne
les empêche de se marcher dessus sauf une chose — **chaque écriture annonce la révision
sur laquelle elle s'appuie**, et une écriture partie d'une version périmée est refusée.
Un outil de fichier ne peut pas annoncer de révision. Si tu écris le JSON directement,
tu effaceras proprement les trois cartes qu'on vient de déplacer, sans erreur et sans
que personne le voie.

Donc : **`meals_read` puis `meals_write`**, toujours.

### `meals_read`

```
meals_read(page: "sante/septembre.md")
```

Rend la forme déclarée par la page, toutes les cartes (calées, en tray, écartées) et la
**révision**. C'est aussi la seule bonne façon de répondre à une question sur le
planning : lire le JSON seul te donnerait un état, mais pas celui que la page encadre.

### `meals_write`

```
meals_write(page: "…", revision: "…", ops: [ … ])
```

Les opérations s'appliquent **dans l'ordre, tout ou rien**. Une révision périmée, ou une
opération invalide, et **rien n'est écrit** — tu relis et tu refais.

| opération | ce qu'elle fait |
|---|---|
| `{op:"add", item:{id, titre, …}}` | ajoute une carte **au tray** |
| `{op:"place", id, jour, section?, ordre?}` | la pose sur un jour (et la confirme) |
| `{op:"tray", id}` | la renvoie au tray, calage effacé |
| `{op:"dismiss", id}` | l'écarte : gardée, plus jamais proposée |
| `{op:"set", id, fields:{…}}` | change `titre`, `ico`, `quantite`, `hint`, `desc`, `source`, `props` |
| `{op:"remove", id}` | la supprime |

**Groupe tes écritures.** Proposer douze repas, c'est **un** appel avec douze `add`, pas
douze appels — chacun ferait tourner la révision et le suivant serait refusé.

`add` ne pose jamais de jour : inventer une carte et décider quand elle est mangée sont
deux gestes, et le format ne laisse une écriture faire que le premier.

## La carte : une face muette, un détail au clic

```json
{ "id": "burrata", "titre": "Pâtes à la burrata", "ico": "🍝",
  "statut": "confirme", "jour": "2026-08-10", "section": "soir", "ordre": 1,
  "quantite": "pour 4",
  "desc": "Le classique. Tomates confites la veille si on y pense.",
  "props": { "pâtes": "500 g", "burrata": "2 boules" } }
```

| champ | où | quoi |
|---|---|---|
| `titre` | face | ce que c'est. Obligatoire avec `id`. |
| `ico` | face | un emoji. Optionnel. |
| `quantite` | face | **combien de cette chose** — `125 g`, `pour 4`. Texte libre. |
| `hint` | face (tray) | l'accroche courte d'une suggestion. Une ligne. |
| `desc` | modale | la prose : le pourquoi, la recette, ce que tu veux. |
| `props` | modale | le détail structuré. Voir ci-dessous. |
| `source` | modale | d'où ça vient — `cab:3033610060529`. |

La face est **muette** exprès : une carte de suivi porte douze nutriments, si elle les
affichait une journée ferait trois écrans. `quantite` n'est pas dans `props` — c'est la
quantité de la chose, pas une propriété de la chose.

**Statuts** : `suggestion | confirme | ecartee`. **Invariant** : une carte calée est
`confirme`, une carte sans jour ne l'est jamais. Les opérations le tiennent pour toi.

## `props` — libre, ordonné, et jamais calculé

Un objet de **clés libres → valeurs texte**. Le moteur n'en connaît aucune, n'en impose
aucune, et surtout **n'en calcule rien** : il ne convertit pas d'unités, ne totalise pas
une journée, ne compare pas deux semaines. C'est ton travail — et c'est pour ça que les
valeurs sont du texte (`"1,2 g"`, `"2 boules"`).

Le même champ sert des deux côtés, et c'est ce qui fait tenir un seul contrat :

```json
"props": { "pâtes": "500 g", "burrata": "2 boules" }
"props": { "énergie": "72 kcal", "protéines": "4,1 g", "sel": "0,06 g" }
```

**L'ordre compte** : les clés sont rendues dans l'ordre où tu les écris.

### Les clés usuelles — une convention, pas un schéma

Rien ne les impose. Elles existent parce que **le fichier est le mot que tu laisses à ta
propre relecture dans deux semaines** : si tu écris `kcal` lundi, `calories` mardi et
`énergie` mercredi, les trois cartes s'afficheront parfaitement et c'est ton total qui
sera faux, sans que rien à l'écran ne le signale.

Pour ce qu'on mange : `énergie` (kcal), `protéines`, `glucides`, `dont sucres`,
`lipides`, `dont saturés`, `fibres`, `sel` (g). Pour ce qu'on cuisine : le nom de
l'ingrédient en clé, la quantité en valeur.

Si l'instance a d'autres habitudes, ce sont les siennes qui gagnent : écris-les dans tes
propres instructions plutôt que d'attendre quelque chose de ce fichier.

## Dire OÙ elle est — l'adresse d'une période

Une période est une page, donc elle s'ouvre comme une page :

```
#/page/<chemin de la page, SANS le .md>
```

`sante/septembre.md` s'annonce `#/page/sante/septembre`. Le chemin est celui de
la **mémoire** (la racine des magasins), jamais celui du disque, et l'extension
tombe.

**Dis-la à chaque fois que tu viens d'en cadrer une.** C'est la première chose
qu'on te demandera, et une adresse inventée mène à une autre page du même
dossier — qui s'affiche parfaitement, ce qui rend l'erreur longue à voir.

## ⚠️ Où NE PAS ranger une période

Une période vit dans le dossier de son sujet : le dossier d'un voyage, un
carnet de santé, un domaine. Mais **quatre noms de dossier appartiennent déjà à
une app**, où qu'ils se trouvent dans l'arbre :

| nom | l'app qui le prend |
|---|---|
| `journal` | Journal |
| `voyages` | Voyages |
| `todo` | Todo |
| `veille` | Listening-post |

Une app qui « absorbe » un nom le prend **partout** où cette suite de segments
se trouve — `sante/dietetique/journal` est le dossier de l'app Journal autant
que `journal` à la racine — et tout ce qui est dessous avec. Conséquence pour
une période rangée là : le dossier n'apparaît plus en section, la navigation y
renvoie l'app propriétaire, et l'app en question ne connaît pas les périodes.
La page reste ouvrable par son adresse directe et **par rien d'autre**.

Donc : un journal de repas se range dans `sante/dietetique/repas/`,
`sante/dietetique/semaines/`, ou simplement à côté des autres fiches — jamais
dans un dossier `journal/`.

## Cadrer une période

Écris la page — c'est du markdown ordinaire, tes outils suffisent. Le fichier de données
n'a pas à exister : une page sans lui est une période vide, avec un tray vivant, et le
premier `meals_write` le crée.

**Sans `debut` ni `fin`, il n'y a pas de frise** : la page rend le tray seul. Un vivier
d'idées est une période sans dates, et c'est un état légitime.
