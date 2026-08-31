# Le moteur de l'atelier — pourquoi il existe et comment il est découpé

`skills/workbook-json/SKILL.md` dit la forme du `workbook.json`. Ce fichier-ci
dit d'où viennent les nombres qu'il contient.

## Le problème

Un workbook porte des cotes finies : `CÔTÉ-G, longueur 851`. Il ne porte pas
d'où vient le 851. La dérivation vivait en prose, dans le champ `note` de
chaque pièce — et l'historique des corrections dans une `note` globale de
4 800 caractères qui racontait quatre passes du même jour.

Trois conséquences, toutes constatées sur des projets réels :

1. **Corriger, c'est rétro-concevoir.** Changer une décision oblige à deviner
   quelles cotes en dépendaient, puis à les reprendre une par une. Un fil de
   correction a coûté plus cher que la conception qu'il corrigeait.
2. **Une règle appliquée à la main est appliquée partiellement.** Le retrait
   d'1 mm par bord chanté, fait sur un projet, oublié sur le suivant — sur une
   pièce pourtant identique dans son principe.
3. **Rien ne vérifie une cote.** Le validateur existant contrôle la cohérence
   *interne* du workbook — chevauchement de poses, débordement de bande, pièce
   jamais débitée. Il ne peut pas savoir que 832 aurait dû être 851 : il ne
   connaît ni la hauteur du meuble, ni la façon dont le dessus est monté.

La cause commune : **le workbook est une sortie, et il n'existe pas d'entrée.**

## Le principe

Un seul fichier, avec une frontière dedans.

```jsonc
{
  "schemaVersion": "4.0",
  "design": { … },     // LA SOURCE — hors-tout, matières, choix de montage
  "derive": {          // la signature de ce qui a produit le reste
    "de": "sha256:…",  //   empreinte du design
    "moteur": "…"
  },
  "pieces": [ … ],     // DÉRIVÉ — recalculable, jamais édité à la main
  "debit": [ … ]
}
```

On ne corrige plus une cote : on corrige une **entrée**, et le dérivé se
recalcule. La signature dit si les deux sont encore d'accord ; quand elle ne
colle plus, l'établi affiche « périmé » plutôt que de dessiner sur une TV
d'atelier un plan que personne n'a recalculé.

`memory/` n'est pas versionné (cf. la refonte « deux magasins » : snapshots,
pas de git). L'historique ne peut donc pas venir d'un VCS — il vient de deux
mécanismes, et aucun des deux ne demande de dépôt :

- **Un journal des entrées**, dans le design : `{ le, champ, avant, apres,
  pourquoi }`. On journalise ce qui est décidé, jamais ce qui en découle.
  Quatre passes de correction tiennent en six lignes.
- **Le diff à la dérivation** : le moteur compare ce qu'il vient de calculer à
  ce qu'il s'apprête à écraser, et rend le delta — *« `plan_travail: aucun →
  rapporte` : DESSUS disparaît, 2 traverses apparaissent, CÔTÉ passe de 832 à
  851, le débit tombe de 2 plaques à 1 »*. Un `plan`, pas un `log` : le
  changement se voit au moment où on le fait.

## Les couches

```
moteur/
├── specs/      le figé : données constructeur, défauts chiffrés
├── methodes/   les tables de décision — QUELLE règle s'applique
├── modele/     le squelette : ancrages → relations entre cotes
├── derive/     la résolution : contraintes → cotes + degrés de liberté
├── eval/       les issues typées : géométrie, métier, non-tranché
└── debit/      le calepinage, les deux sens de plaque comparés
```

### Ce qui est une table, ce qui est du code

Une table **choisit une méthode ; elle ne l'implémente jamais.**
`fond-rainure-2-cotes` est un nom ; ce que ce nom pose comme relations entre le
fond, les côtés et le hors-tout est du code, dans `modele/`.

Ce partage n'est pas cosmétique, il borne qui peut écrire quoi. Ajouter une
ligne de table, c'est choisir dans un vocabulaire existant : vérifiable, peu
risqué, à la portée de l'agent. Ajouter une méthode, c'est écrire du calcul :
ça reste du code. Et il garde les tables **plates**, donc réellement
tabulaires — une sortie est un nom ou une valeur, jamais un objet.

Une méthode inconnue est refusée en nommant la ligne et la table. Une faute de
frappe ne devient jamais une cote.

### Où vivent les tables

**Pas ici.** Une table est un document de la mémoire, porté par la fiche
savoir-faire qui la justifie, et rendue dans cette fiche par le bloc
`:::regles` que ce plugin contribue au vocabulaire.

Le paragraphe explique le mécanisme, la table donne les valeurs, et les deux
sont dans le même document — on ne peut pas les désynchroniser. La prose cesse
en échange de citer les chiffres qui sont dans la table : rien n'est écrit deux
fois, donc rien ne peut diverger. C'est la leçon d'une skill restée en « schéma
2.0 » quand l'image livrait le 3.0.

Deux étages, pas trois :

| | Où | Qui écrit |
|---|---|---|
| Les méthodes, le moteur, le contrat | ici, dans l'image | le corps |
| Les tables | la mémoire, dans les fiches | l'agent, sur demande |
| Paramètres et dérogations | le workbook du projet | l'agent, au fil du projet |

Le plugin ne livre aucune table d'amorçage : un jeu de règles générique que
personne n'a validé à l'atelier serait exactement la fausse certitude qu'on
cherche à supprimer.

### Plusieurs jeux de règles

Une table déclare son domaine (`applique_a`). Les règles d'un caisson en
panneau ne sont pas celles d'une table en massif — le massif a le fil, le
retrait, les trous oblongs ; le panneau a les chants et le décor. Ce sont des
familles disjointes, pas des variantes.

Le design déclare sa famille, le moteur ne charge que les tables applicables
**et dit lesquelles il a écartées**. Transposer le réflexe d'un projet à un
autre — l'erreur nommée dans `agencement-meuble`, commise sur un vrai projet —
devient mécaniquement impossible au lieu d'être déconseillée dans un
paragraphe.

### Les dérogations sont des colonnes manquantes

Un projet peut s'écarter d'une table, en le disant :

```jsonc
"derogations": [
  { "table": "debit/derasage", "on_fait": "aucun",
    "pourquoi": "meuble de garage, éclats tolérés et réparables" }
]
```

Une dérogation sans `pourquoi` est refusée. Et elles sont **comptées** : la
même dérogation prise quatre fois sur cinq projets remonte comme une issue —
la table a une colonne manquante. La dérogation d'aujourd'hui est la ligne de
table de demain, et le système le signale au lieu qu'on le remarque.

C'est déjà ce que disent les fiches : on saute le dérasage sur un meuble de
garage parce que *« c'est la destination du meuble qui autorise à s'en écarter,
pas l'envie d'aller vite »*. Ce n'était pas une exception, c'était une colonne
`destination` qui manquait.

## Les cotes : des relations, pas des soustractions

`derive/` résout un système de **contraintes linéaires** (Cassowary, porté —
aucune dépendance externe, comme tout plugin ici) plutôt qu'il n'évalue des
formules dirigées.

```
# une formule dit un sens de calcul
cote.h = meuble.H - bas.ep

# une relation ne dit qu'un fait
cote.h + bas.ep == meuble.H
```

Trois propriétés en découlent :

- **Le sur-contraint est refusé et nommé.** Poser en plus que le dessus
  capture le côté rend le système contradictoire ; le solveur refuse la
  relation fautive. La même erreur, écrite en formules, avait produit `832` —
  un nombre parfaitement plausible, né d'une soustraction faite deux fois.
- **Ça marche dans les deux sens.** Figer une cote qui était une conséquence
  (« j'ai des côtés de 851 en chute ») demande de libérer une entrée en
  échange, et le moteur dit lesquelles.
- **Les préférences existent** : « les trois tiroirs d'égale hauteur » en
  faible, « la somme fait la hauteur utile » en obligatoire.

**Le sous-contraint, lui, n'est pas détecté par le solveur** — il choisit une
valeur, sans se plaindre. C'est le mode d'échec qu'on cherche justement à
supprimer : une formule oubliée laisse un champ vide, une relation oubliée
produit un nombre. Le compteur de degrés de liberté n'est donc pas une option :
on résout deux fois avec des préférences différentes, et toute cote qui bouge
est une cote non déterminée, listée par son nom. C'est le « fully constrained »
d'un logiciel de CAO, et sans lui le solveur serait plus dangereux que les
formules qu'il remplace.

**Frontière** : le solveur ne prend que les cotes. Les comptages (une charnière
tous les 60 cm, les Tenso d'une jonction), les choix de méthode et le
calepinage restent des fonctions et des tables — Cassowary ne fait que du
linéaire continu.

## Les lots

1. **La frontière et le contrôle.** Le schéma 4.0, la signature, la migration
   depuis le 3.0, les tables et l'évaluation métier. L'agent continue d'écrire
   les cotes ; le moteur les recalcule et refuse. Le lot est fini quand il
   rattrape les quatorze erreurs d'un workbook réel, versées au harnais.
2. **La dérivation.** Le solveur, les ancrages, les degrés de liberté :
   l'agent cesse d'écrire des cotes. En fin de lot, la fiche projet perd les
   siennes — elle garde la narration, l'établi rend le workbook.
3. **Le calepinage.** Les deux sens de plaque comparés, la chute consolidée,
   le grain « une largeur, un réglage ».

Le lot 1 est autonome : même s'il s'arrêtait là, on ne coupe plus une plaque
sur une cote fausse.

## Dette connue

`tools/atelier.mjs` est un bundle importé du shell dont ce plugin a été
extrait : sans source dans ce dépôt, illisible, et donc non modifiable. Il
continue de servir `valide` et `migre` sur le 3.0. Le moteur, lui, est en ESM
lisible et importe `web/regles.js` — la source dont ce bundle est un tirage.
Les deux se rejoindront quand `migre` devra produire du 4.0.
