---
name: regles-json
description: >
  Le CONTRAT des TABLES DE DÉCISION que le moteur d'atelier consulte pour coter un meuble —
  quelles règles s'appliquent à ce design, et laquelle. Une table CHOISIT une méthode ; elle ne
  la calcule pas. À consulter avant d'écrire ou de modifier une règle de menuiserie, et avant
  de faire dériver un workbook en 4.0. Le format et le vocabulaire des méthodes sont livrés par
  l'image ; les tables elles-mêmes vivent dans ton workspace, avec les fiches qui les justifient.
---

# Les tables de décision — le contrat

Le moteur ne sait pas quelles règles s'appliquent à un meuble. Il le demande à
des **tables** : des entrées (les décisions du design), des lignes, et pour
chacune la **méthode** à appliquer. Le calcul, lui, est du code livré par
l'image.

Le partage n'est pas cosmétique, il borne ce que tu peux écrire seul :

- **ajouter une ligne**, c'est choisir dans un vocabulaire qui existe déjà —
  vérifiable, peu risqué, ton travail ;
- **ajouter une méthode**, c'est écrire de l'arithmétique — c'est du code, donc
  une demande à faire au corps.

Une méthode que le moteur ne connaît pas est refusée en nommant la table et la
ligne qui l'ont produite. Une faute de frappe ne devient jamais une cote.

## Le format

Un fichier JSON par table, dans un dossier que tu passes au moteur.

```jsonc
{
  "id": "fond",
  "titre": "Fond de caisson — méthode et matière",
  "applique_a": ["caisson"],
  "entrees": {
    "pose":    ["mobile", "fixe"],
    "fond":    ["oui", "non"],
    "dessous": ["ramene", "pleine-profondeur", "encastre"]
  },
  "sorties": ["methode", "materiau"],
  "lignes": [
    {
      "quand": { "fond": "non" },
      "alors": { "methode": null },
      "note": "Un meuble peut n'avoir aucun fond — c'est une décision, pas un oubli."
    },
    {
      "quand": { "pose": "fixe", "fond": "oui", "dessous": "encastre" },
      "alors": { "methode": "fond-rainure-encastre", "materiau": "fond" },
      "note": "La rainure d'encastrement retient le bord bas du fond, pas des vis."
    }
  ]
}
```

- **`applique_a`** — la ou les FAMILLES de meuble. Obligatoire : une table sans
  famille s'appliquerait à un meuble qu'elle ne connaît pas. Les règles d'un
  caisson en panneau ne sont pas celles d'une table en massif.
- **`entrees`** — chaque entrée avec son domaine ÉNUMÉRÉ. C'est lui qui rend
  l'exhaustivité vérifiable. Le design doit répondre à toutes.
- **`sorties`** — les noms que `alors` a le droit de porter. Une sortie non
  déclarée est refusée.
- **`quand`** — une entrée omise est un JOKER (tous les cas). Une cellule peut
  porter plusieurs valeurs : `{ "plan_travail": ["rapporte", "integre"] }`.
- **`note`** — le POURQUOI de la ligne. Elle ne sert à rien au calcul et à tout
  à la relecture : écris-la comme tu écris une fiche.

## Deux invariants, et ils sont vérifiés

**Exhaustivité.** Toute combinaison des domaines tombe sur une ligne. Un cas
sans ligne est un TROU, et il est nommé — c'est ce qui a manqué le jour où une
règle de fond s'est appliquée à un meuble qui n'en a pas. Un cas volontairement
sans suite s'ÉCRIT : `{ "quand": { "fond": "non" }, "alors": { "methode": null } }`.
La différence entre « la règle ne s'applique pas » et « personne n'y a pensé »
est toute la valeur d'une table.

**Unicité.** Exactement une ligne par cas. Deux lignes qui se recouvrent sont
une erreur, jamais une priorité : l'ordre des lignes d'un tableau que personne
ne relit n'est pas un endroit où ranger une décision d'atelier.

**Pas de seuil dans une cellule.** Les domaines sont énumérés, point. Un
critère qui dépend d'un COMPTE (« assez de tablettes pour qu'un réglage de plus
ne coûte rien ») est calculé par le moteur AVANT d'interroger la table, et
arrive comme une entrée ordinaire — `mutualise: oui | non`. Une cellule qui
calcule est une cellule qu'on ne relit plus.

## Le vocabulaire des méthodes

Ce que chaque nom pose, et les entrées de design qu'il consomme.

| méthode | ce qu'elle fait |
|---|---|
| `dessus-plaque-entre` | dessus plein ABOUTÉ entre les côtés — le montage de la maison. Le côté ne perd que le bas |
| `dessus-plaque-entre-ramene` | le même, ramené en profondeur pour laisser passer un fond en rainure |
| `dessus-plaque-pleine` | dessus qui COIFFE et capture les côtés. Possible, jamais retenu ici : le côté y perd deux épaisseurs |
| `dessus-traverses` | deux traverses avant/arrière posées SUR les côtés — le cas du plan de travail rapporté |
| `fond-structurel` | fond plein entre les côtés, posé sur le bas — le cas mobile, il encaisse le vrillage |
| `fond-rainure-traversant` | fond fin en rainure, que rien n'arrête en bas (dessous ramené) |
| `fond-rainure-arrete` | fond fin arrêté par un dessous pleine profondeur |
| `fond-rainure-encastre` | fond fin encastré dans une rainure du dessous |
| `tablette-fixe` | tablettes entre les côtés ; sortie `retrait_avant: oui\|non` |
| `separateurs` | pose les séparateurs que le design LISTE ; la table dit seulement s'il y en a |
| `tiroirs-facades` | les façades, qui se partagent la hauteur utile |
| `tiroirs-corps` | flancs, montant avant, dos, fond en rainure |

**Les façades ne sont JAMAIS le corps du tiroir.** La façade se visse après
pose : les coulisses n'ont aucun réglage, et un jeu de 3 mm entre façades
voisines ne peut pas dépendre de l'endroit où les rails ont été posés.

## Ce que le design doit dire

Les entrées que ces tables interrogent, et les paramètres que les méthodes
consomment. Un paramètre absent ne prend pas de valeur par défaut : la cote
reste LIBRE, nommée, et bloque la dérivation.

```jsonc
"design": {
  "famille": "caisson", "trigramme": "PBL", "module": "C1",
  "hors_tout": { "l": 800, "p": 650, "h": 905 },
  "pose": "mobile", "plan_travail": "rapporte", "facade": "ouverte",
  "fond": "non", "dessous": "pleine-profondeur",
  "separateurs": [{ "type": "frontal" }], "tablettes": 0, "tiroirs": 0, "corps_tiroir": "plus-tard",
  "faces_chantees": ["avant", "arriere", "gauche", "droite"],
  "materiaux": { "principal": { "id": "MEL19", "ep": 19, "chante": true } },
  "parametres": {
    "marge_fond": 5, "rainure_prof": 9, "rainure_encastrement": 5, "fond_jeu": 3,
    "retrait_fond_dos": 20, "retrait_tablette_avant": 3, "profondeur_traverse": 150,
    "jeu_facade": 3, "jeu_facade_lateral": 2, "retrait_chant": 1,
    "ep_coulisse": 12.5, "jeu_coulisse": 1, "profondeur_coulisse": 550,
    "hauteur_tiroir": 150, "rainure_tiroir_prof": 6
  }
}
```

`faces_chantees` déclare **ce qu'on chante**, pas ce qu'on voit : sur trois
meubles accolés, les côtés joints ne se voient pas et se chantent quand même,
pour n'avoir qu'un réglage de bande. Un bord se chante s'il est tourné vers une
de ces faces et que rien ne l'occulte — dedans comme dehors, et **porte
ouverte** : un caisson fermé se chante dedans comme un caisson ouvert.

## Déroger

Un projet peut s'écarter d'une table, en le disant. Le `pourquoi` est
obligatoire — une dérogation sans raison ne peut pas devenir la ligne de table
qu'elle annonce.

```jsonc
"derogations": [
  { "table": "tablette", "on_fait": { "retrait_avant": "oui" },
    "pourquoi": "pas de porte à dégager, mais 3 mm de retrait voulus ici" },
  { "piece": "IMP-C1-BAS", "on_fait": { "compense_chant": "non" },
    "pourquoi": "panneau déjà débité — le chant se pose en surépaisseur" }
]
```

Une dérogation vise une TABLE (« sur ce meuble, cette règle donne autre
chose ») ou une PIÈCE (« celle-ci, on n'y touche pas »). La seconde est le cas
d'un panneau déjà coupé.

Les dérogations sont **comptées** : la même prise plusieurs fois sur des projets
différents, c'est une COLONNE qui manque à la table. La dérogation d'aujourd'hui
est la ligne de table de demain.

## Vérifier

`atelier_questions` dit ce qu'un design ne tranche pas encore — entrées sans
réponse, cotes que rien ne détermine, paramètres manquants. **À appeler avant
de coter quoi que ce soit : une question non posée est une cote fausse.**

`atelier_derive` dérive et compare aux pièces déjà là. Rien n'est écrit tant
que tout n'est pas déterminé : un workbook à moitié dérivé est pire qu'un
workbook pas dérivé, parce qu'il se dessine et qu'on coupe dessus.
