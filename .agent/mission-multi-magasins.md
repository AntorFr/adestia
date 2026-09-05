# Mission — plusieurs magasins, une seule mémoire

> Lettre de mission pour l'agent qui implémentera la composition de magasins.
> **⚠️ À SUPPRIMER une fois la fonctionnalité livrée**, dans le commit final,
> avec `DESIGN.md` et `status.md` à jour : le contrat vivant sera le code et
> `DESIGN.md`, pas cette lettre. Même règle que celle du plugin de chantiers.

## Le besoin, dans les mots du propriétaire

> Un domaine peut avoir des éléments **partagés** ou **perso**. Exemple :
> `voyages`. L'idée est d'avoir une vision **fusionnée** des deux dans
> l'interface.

Sur le disque, deux arbres — `data/local` et `data/famille`. À l'écran, **une
seule tuile** : si `local/voyages` et `famille/voyages` existent tous deux, on
voit un seul domaine, comme si les deux dossiers étaient fondus. Avec une
**pictographie** (couleur, logo) qui dit de quel magasin vient chaque carte.

## Le prédécesseur a déjà tranché — ne pas redécouvrir

`agent-gw` (`~/Dev/agent-pods/images/agent-gw/app/main.py`, section « Les
MAGASINS de mémoire ») a implémenté ça, et ses arbitrages tiennent. **Les lire
avant d'écrire une ligne** ; ce qui suit en est la transcription.

### 1. Le chemin logique ne contient JAMAIS le magasin

`domaines/cadeaux/idee-x` est un **nom**. Le magasin est un fait
d'**emplacement**, pas un morceau d'identité.

> « C'est cette règle qui fait que déplacer une fiche d'un cercle à l'autre ne
> casse aucun wikilink, aucun favori, aucune référence — et **sans elle, tout
> le reste tombe**. »

Conséquence directe et heureuse pour nous : `resolveHref`, les wikilinks, les
références et tout le front continuent de fonctionner **sans une ligne de
changement**. Un `mv` d'un magasin à l'autre est une promotion de cercle, pas
une migration.

### 2. Un domaine ne se range pas DANS un magasin — il se COMPOSE par union

Et l'union d'un ensemble à un élément est l'identité. Donc **le mono-magasin
reste identique au bit près**, ce qui n'est pas une intention mais un test :
comparaison **octet à octet** des réponses sérialisées.

> « C'est un diff, pas une impression. Si le composeur changeait quoi que ce
> soit — ordre, champs, chemins — ça se verrait ici et nulle part ailleurs. »

**C'est le contrôle de non-régression, et il est gratuit. L'écrire en premier.**

### 3. La précédence est l'ordre de déclaration

Du plus restreint au plus large : `perso` avant `parents` avant `famille`. Le
premier magasin qui porte un chemin gagne.

### 4. Une collision n'est jamais tranchée en silence

> « Une fiche qu'on croit corriger alors qu'on en lit une autre est une panne
> qui ne se voit qu'après. »

`agent-gw` remonte les collisions dans un champ dédié. **Nous allons plus loin
— voir « ce qui change » ci-dessous.**

### 5. L'écriture va au magasin PRINCIPAL, la garde est par magasin

Les écritures visent `stores[0]`, bornées à lui. Et la garde de traversée
s'applique **magasin par magasin** : un `../` ne doit pas permettre de sortir
en profitant de la présence d'une seconde racine.

### 6. Ce qui s'EXÉCUTE n'est pas unionné

> « Une planification est **exécutée** — son corps est le prompt d'un tour. La
> composer sur l'union laisserait un pair déposer du code qui tournerait ici. »

**Ratifié le 05/09, et dans des termes plus forts que « pas d'union »** : une
planification est **propre à l'instance**, pas à la mémoire. Elle vit dans le
magasin principal de CETTE coque, et n'est **jamais chargée** d'un autre — ni
composée, ni lue, ni suivie par le veilleur. Ce n'est donc pas une exception à
la règle d'union : c'est un objet qui n'appartient pas au domaine où l'union
s'applique.

La différence n'est pas rhétorique. « Pas d'union » se relâche un jour au
motif qu'un affichage serait pratique ; « ça n'appartient pas à la mémoire »
ferme la question. Un magasin partagé est un endroit où un pair écrit — et ce
qui s'exécute ici ne doit jamais venir de là.

### 7. Le champ `store` n'apparaît que s'il y a plus d'un magasin

L'ajouter dans le cas mono changerait la réponse pour rien, et le front n'a pas
à connaître un découpage qui n'existe pas chez lui.

## Ce qui CHANGE par rapport au prédécesseur

Trois ajouts demandés le 05/09, dont un qui **renverse** un arbitrage.

**Le conflit de fichiers ne se cache plus.** `agent-gw` laissait gagner le
premier magasin et masquait l'autre, en signalant la collision. Désormais :
**les deux s'affichent**, le second suffixé de son magasin dans le front —
« Voyage Italie » et « Voyage Italie (Famille) ». Cacher une fiche est un pire
échec que la montrer deux fois sous deux noms. *(Deux dossiers homonymes, eux,
ne sont pas un conflit : ils fusionnent. C'est tout le principe.)*

**Une pictographie par carte** dit de quel magasin elle vient — couleur, logo,
au choix du dessin. C'est ce que le champ `store` sert à porter.

**L'agent demande où ranger, mais seulement quand la question se pose.** Les
instructions listent les magasins ; à la création d'une ressource dans un
domaine présent dans **plusieurs** magasins, l'agent demande lequel. Un domaine
qui n'existe que dans un seul magasin ne pose **aucune** question — sinon on
transforme chaque création en formulaire.

**Les plugins : rien à faire.** Une carte dont le plugin manque s'affiche mal,
et c'est acceptable. Ne pas inventer de négociation.

## Ce que ça coûte chez nous — la couture est bonne

Une **seule ligne** calcule la racine, et quatre consommateurs la reçoivent :

```
packages/server/src/app.ts:977
  const pagesRoot = join(config.workspace.root, config.workspace.pages)
     ├─ registerPages    → listMarkdown(root), safePagePath(root, …)
     ├─ registerEvents   → le veilleur chokidar
     ├─ registerFiles    → attachmentsOf(root, …) et le `?under=`
     └─ plugin-host      → `pagesRoot` passé aux plugins
```

Donc : `pagesRoot: string` devient une **liste ordonnée**, et chaque
consommateur compose par union avec précédence. Le reste du produit ne bouge
pas, grâce à la règle nº 1.

Trois points d'attention, dans l'ordre où ils mordront :

- **Le veilleur** surveille aujourd'hui une racine. Il en surveillera N, et un
  même chemin logique peut changer dans deux magasins — l'événement porte le
  chemin logique, pas le magasin.
- **`attachmentsOf`** cherche les fichiers non-markdown du dossier d'une page
  *et* de son `assets/`. Avec plusieurs magasins, les pièces jointes d'un même
  dossier logique peuvent être réparties : elles s'unionnent comme le reste.
- **L'écriture** (`PUT /api/pages/*`) vise le magasin principal. Une page lue
  depuis `famille` et sauvegardée atterrirait dans `perso` — **c'est le piège**,
  et il faut décider : refuser, écrire là où la page a été lue, ou demander.
  `agent-gw` bornait au principal ; à nous de trancher, en sachant que la
  co-édition est le régime voulu.

## La configuration

Aujourd'hui `workspace: { root, pages, memory, planif }`, quatre chaînes. Le
prédécesseur déclarait `id=chemin:mode`, séparés par des virgules, avec repli
sur un magasin unique quand la variable est absente — **rétrocompatible par
construction**. Garder cette propriété : une instance sans magasins déclarés ne
doit pas bouger d'un octet.

## Le cas qui a motivé la demande

Le magasin `famille` (PVC `memoire-famille`, dataset ZFS partagé) n'a plus ni
lecteur ni écrivain depuis la sortie d'agent-gw le 05/09 : ses deux corps le
montaient, aucune coque Adestia ne le fait. Deux données à connaître avant de
le brancher : le dataset est en **`2770`, gid `3002`** — « others » n'a rien,
pas même le droit de traverser, donc `supplementalGroups: [3002]` est
obligatoire côté pod — et la raison qui le tenait hors du workspace (« il
entrerait dans le dépôt git et `memory-sync` versionnerait le cercle d'un autre
corps ») est **morte** : `memory-sync` a disparu et la mémoire a quitté git le
2026-08-20.

En attendant cette fonctionnalité, il peut se monter comme un simple dossier de
l'arbre de pages. C'est un dépannage, pas la cible : il rangerait le cercle
familial **dans** le magasin perso, ce que la règle nº 1 interdit précisément.
