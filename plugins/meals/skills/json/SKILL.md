---
name: json
description: >
  Le CONTRAT DE DONNÉES du bloc `:::meals` — le format d'un `<nom>.meals.json`, que le
  front rend en frise (un ascenseur par jour, chaque jour découpé en sections) et en
  tray de cartes déplaçables. À consulter dès que tu crées ou modifies une période de
  repas : ce que porte une carte, l'invariant de calage, ce qui s'affiche et ce qui
  attend le clic. Livré par le plugin avec le moteur qui le lit. Le métier — juger une
  semaine, dresser une liste de courses, convertir des unités — reste chez toi.
---

# `.meals.json` — le contrat de données

Un fichier par période. Le front le rend en **frise** : un ascenseur vertical, un bloc
par jour, chaque jour découpé en **sections** (`matin` / `midi` / `soir` par défaut), et
un **tray** sur le côté avec ce qui n'est pas encore calé. On glisse une carte du tray
vers une section, d'une section à l'autre, d'un jour à l'autre, et du calé vers le tray.

Le fichier se pose **à côté de la page qui en parle** — `semaine.meals.json`, ou
`assets/semaine.meals.json` — et la page l'appelle :

```markdown
:::meals{source="semaine.meals.json"}
:::
```

Le bloc **n'a pas de corps** — ses attributs sont tout son sens — mais la ligne de
fermeture reste obligatoire, comme pour n'importe quel `:::`. Sans elle, tout ce qui
suit dans la page est avalé comme corps du bloc, et un bloc déclaré sans corps qui en
reçoit un ne se rend pas du tout.

Ce n'est **pas** un domaine et il n'y a pas de tuile : une période de repas s'accroche à
la fiche qui a une raison de la porter (un voyage, un carnet de santé, une semaine de
journal). Elle reste atteignable seule par `#/meals/<chemin>`, et `vue="lien"` pose une
carte compacte qui y mène — pour qu'une fiche puisse en citer deux sans empiler deux
frises.

## Un seul mécanisme, deux usages

Le même fichier sert à **décider** ce qu'on va manger et à **consigner** ce qu'on a
mangé. Ce n'est pas un mode à déclarer, et il n'y a délibérément aucun champ pour le
dire : dans les deux cas il y a une période, des sections, des cartes calées et un tray.
Ce qui change est **ce que tu écris dedans**, pas la mécanique.

```json
{
  "version": 1,
  "titre": "Corse — la semaine",
  "debut": "2026-08-08",
  "fin": "2026-08-14",
  "sections": ["matin", "midi", "soir"],
  "items": [
    { "id": "burrata-lundi", "titre": "Pâtes à la burrata", "ico": "🍝",
      "statut": "confirme", "jour": "2026-08-10", "section": "soir", "ordre": 1,
      "quantite": "pour 4",
      "desc": "Le classique. Tomates confites la veille si on y pense.",
      "props": { "pâtes": "500 g", "burrata": "2 boules", "tomates cerises": "250 g" } },

    { "id": "poulet-citron", "titre": "Poulet au citron", "ico": "🍋",
      "statut": "suggestion",
      "hint": "Se fait pendant qu'on est à la plage",
      "props": { "cuisses de poulet": "8", "citrons": "3" } },

    { "id": "yaourt-mardi", "titre": "Yaourt nature Malo",
      "statut": "confirme", "jour": "2026-08-11", "section": "matin",
      "quantite": "125 g",
      "props": { "énergie": "72 kcal", "protéines": "4,1 g", "sel": "0,06 g" },
      "source": "cab:3033610060529" }
  ]
}
```

## Les règles qui mordent

- **`sections` est déclaré, pas gravé.** Défaut `["matin", "midi", "soir"]`. Une semaine
  de vacances peut n'en vouloir que deux ; un suivi qui veut consigner la collation
  écrit `["matin", "midi", "goûter", "soir"]`. Les noms sont libres et rendus tels quels.
- **Statuts** : `suggestion | confirme | ecartee`. `ecartee` garde la carte dans le
  fichier et ne la propose plus — c'est ce qui empêche l'agent de reproposer chaque
  semaine ce qui a déjà été refusé.
- **Invariant de calage** : une carte `confirme` porte **toujours** un `jour` (et une
  `section`) ; une `suggestion` n'en porte **jamais**. Confirmer, c'est changer le statut
  **et** poser le calage — jamais recopier la carte, c'est la même de bout en bout.
- **Sans `debut` ni `fin`, il n'y a pas de frise** : la page rend le tray seul. Un vivier
  d'idées est une période sans dates, et c'est un état légitime.
- **`ordre`** est le rang de la carte dans sa section, posé par la position de dépôt et
  **fractionnaire** — insérer entre deux voisines ne renumérote personne. Une section
  tient plusieurs cartes : un déjeuner, c'est une entrée et un plat ; un déjeuner
  *consigné*, c'est quatre lignes.

## Ce que la carte montre, et ce qu'elle garde pour le clic

La face d'une carte est **muette** : l'icône, le titre, la quantité — et `hint` en une
ligne quand elle est au tray. Rien d'autre. Une carte de suivi porte douze nutriments ;
si elle les affichait, une journée ferait trois écrans.

| champ | où | quoi |
|---|---|---|
| `titre` | face | ce que c'est. Le seul champ obligatoire avec `id`. |
| `ico` | face | un emoji. Optionnel, échappé au rendu. |
| `quantite` | face | **combien de cette chose** — `125 g`, `pour 4`. Texte libre. |
| `hint` | face (tray) | l'accroche courte d'une suggestion. Une ligne, rien ne la tronque. |
| `desc` | modale | la prose : le pourquoi, la recette, ce que tu veux. |
| `props` | modale | le détail structuré. Voir ci-dessous. |
| `source` | modale | d'où ça vient — `cab:3033610060529`. |

**`quantite` n'est pas dans `props`**, et c'est délibéré : c'est la quantité de la chose,
pas une propriété de la chose. C'est aussi la seule qui reste visible sans cliquer.

## `props` — libre, ordonné, et jamais calculé

`props` est un objet de **clés libres → valeurs texte**. Le plugin n'en connaît aucune,
n'en impose aucune, et surtout **n'en calcule rien** : il ne convertit pas d'unités, ne
totalise pas une journée, ne compare pas deux semaines. C'est ton travail, et c'est
pour ça que les valeurs sont du texte (`"1,2 g"`, `"2 boules"`) plutôt que des nombres
avec une unité à part.

Le même champ sert des deux côtés, et c'est ce qui fait tenir un seul contrat :

```json
"props": { "pâtes": "500 g", "burrata": "2 boules" }
"props": { "énergie": "72 kcal", "protéines": "4,1 g", "sel": "0,06 g" }
```

**L'ordre compte.** Les clés sont rendues dans l'ordre où tu les écris — donc mets
devant ce qui mérite d'être lu en premier.

### Les clés usuelles — une convention, pas un schéma

Rien ne les impose et le moteur n'en lit aucune. Elles existent parce que **le fichier
est le mot que tu laisses à ta propre relecture dans deux semaines** : si tu écris
`kcal` lundi, `calories` mardi et `énergie` mercredi, les trois cartes s'afficheront
parfaitement et c'est ton total qui sera faux, sans que rien à l'écran ne le signale.

Pour ce qu'on mange : `énergie` (kcal), `protéines`, `glucides`, `dont sucres`,
`lipides`, `dont saturés`, `fibres`, `sel` (g). Pour ce qu'on cuisine : le nom de
l'ingrédient en clé, la quantité en valeur.

Si ton instance a d'autres habitudes, ce sont les siennes qui gagnent : écris-les dans
tes propres instructions plutôt que d'attendre quelque chose de ce fichier.

## Les gestes de l'interface ne passent pas par toi

Déplacer une carte, la confirmer d'un glisser-déposer, l'écarter : le front écrit ces
gestes dans un `<nom>.meals-state.json` voisin, **jamais** dans le `.meals.json`. C'est
toi qui consolides ensuite, sur demande. Même frontière que les voyages et les
workbooks : **le front ne touche jamais la mémoire.**

Concrètement, consolider = lire l'overlay, reporter `statut`/`jour`/`section`/`ordre`
sur les items du `.meals.json`, puis **vider** l'overlay (`{"items": {}}`). Tant que tu
ne l'as pas fait, l'overlay gagne à l'affichage — donc rien ne se perd si tu attends.
