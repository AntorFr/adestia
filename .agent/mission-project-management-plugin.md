# Mission — plugin « project-management » : suivre un arbre de chantiers

> Lettre de mission pour l'agent qui implémentera le plugin. **⚠️ À SUPPRIMER
> une fois l'implémentation terminée** (dans le commit final, avec le
> `status.md` à jour) : le contrat vivant sera le schéma du manifeste et la
> skill du plugin, cette lettre ne doit pas survivre comme deuxième source de
> vérité. Même règle que la lettre de `lots`, supprimée à sa livraison.

## ⚠️ VERSION ALPHA — ce qui est ferme et ce qui ne l'est pas

**Ferme, décidé le 29/08** : le découpage des blocs par PROVENANCE de la
donnée, la réutilisation des tâches de `todo`, et la couche d'identité dont
tout dépend (journal de décisions du 27–29/08 dans `DESIGN.md`).

**Ferme, décidé par le propriétaire le 04/09** — six arbitrages qui déplacent
le centre de cette lettre, et qui annulent la version précédente sur ces points :

1. **La hiérarchie est le système de fichiers, sa profondeur est infinie, et
   les types appartiennent à l'utilisateur.** Exit `parent:`, exit les trois
   étages `programme`/`project`/`topic`, exit les `types` du manifeste.
2. **L'agencement des blocs est configurable** — une fiche prend les blocs dont
   elle a besoin, pas ceux d'un gabarit imposé. C'était la question ouverte
   nº 2 ; elle est tranchée par « oui, construis-le ».
3. **Chaque item porte un workflow choisi par l'utilisateur, avec un statut
   final imposé**, qui replie ce qui n'est plus actif.
4. **Un bloc a une PORTÉE** : ce que la fiche écrit, ce que ses enfants
   portent, ou ce que tout son sous-arbre contient. C'est un attribut, pas
   trois catalogues de blocs.
5. **Le dossier se montre lui-même** : ses pages de contenu et ses pièces
   jointes ont chacune leur bloc.
6. **Le temps a son bloc** : des phases, des jalons, et où l'on en est — au
   choix pour ce chantier seul ou consolidé sur ce qu'il contient.

**PAS ferme, et à retravailler avec le propriétaire avant de coder** : les noms
de blocs, la liste exacte des attributs, et surtout **les données d'exemple**.
La maquette tourne sur un jeu inventé (un programme « Homelab 2026 », un projet
« Adestia v1 ») et elle est désormais **antérieure aux décisions ci-dessus** :
elle montre trois profondeurs nommées et un gabarit fixe, c'est-à-dire
exactement ce qui vient d'être abandonné. **Ne rien figer sur sa foi.**

## Le besoin

Voir l'état d'un chantier façon comité de projet : une **synthèse**, ce qui a
été **fait**, ce qui **vient**, les **risques**, les **contributeurs**. Et la
même vue à n'importe quelle profondeur — un programme contient des projets, un
projet des sujets, un sujet des sous-sujets, et rien n'arrête la descente.

## Le modèle : un arbre, et c'est le système de fichiers qui le tient

**Un item est un dossier ; ses enfants sont ce qu'il contient.** Il n'y a pas
de champ `parent:`, pas de graphe à réparer, pas de référence qui casse au
déplacement : déplacer un dossier déplace le sous-arbre, et un `mv` est une
réorganisation de programme. La profondeur n'est bornée par rien parce que
personne ne l'écrit nulle part.

**La page d'un item est la page d'index de son dossier**, et cette question est
DÉJÀ tranchée dans ce dépôt : `packages/web/src/app/sections.ts` accepte
`INDEX.md` **ou** la page homonyme (`dietetique/dietetique.md`, la convention
du shell voisin), et retombe sur le nom du dossier embelli quand il n'y en a
aucune. **Réutiliser `sections.ts`, ne pas réinventer cette règle** : sa
première version, plus principielle, cachait douze dossiers d'un vrai corpus.
C'est le `type` réinventé quatre fois qu'a trouvé l'audit du 21/08.

**Une feuille est une page simple.** Elle n'a pas besoin de dossier tant qu'elle
n'a pas d'enfants ; elle en gagne un le jour où on lui en donne, et sa page
devient l'index de ce dossier. Promouvoir un sujet en projet est un `mkdir` et
un `mv`, pas une migration.

### Les types sont libres, et le plugin n'en déclare AUCUN

Un item porte un `type:` — `projet`, `sujet`, `service`, `lot`, ce que
l'utilisateur voudra. Le plugin ne les connaît pas, ne les valide pas, ne les
revendique pas. Conséquences, toutes bonnes :

- Le manifeste **perd son tableau `types`**, et avec lui le risque de collision
  au démarrage : il n'y a plus rien à réserver.
- Le `type:` devient une **étiquette affichée** et une **clé de configuration**
  (cf. workflows et gabarits plus bas) — jamais un embranchement dans le code.
- Ajouter un cinquième genre d'item ne coûte pas une ligne.

**Ce qui reste à trancher, et c'est la seule vraie question du modèle : à quoi
la vue reconnaît-elle qu'un dossier est un chantier ?** Sans `parent:` et sans
type réservé, il n'y a plus de marqueur. Trois réponses possibles, dans l'ordre
où je les recommande :

1. **La configuration nomme les racines.** Une page `type: pm-config` liste un
   ou plusieurs dossiers, et tout ce qui est en dessous est l'arbre. Zéro
   marquage par fiche, et c'est le patron de `todo-config`, qui nomme déjà le
   dossier où les tâches sont classées.
2. Un champ de frontmatter par item — honnête, mais à écrire deux cents fois.
3. La présence d'un bloc du plugin dans la page — implicite, et illisible le
   jour où quelqu'un supprime le bloc.

## La vue dédiée — et pourquoi elle ne prend PAS de tuile

Le plugin est une **vue sur des dossiers du workspace**, pas un domaine de plus.
Le mécanisme existe : `absorbs` dit au shell quel plugin possède un dossier,
`routeFor` dit au plugin où il le range, et `owners.ts` fait que *tout* lien
vers ce dossier — fil d'Ariane compris — arrive dans la vue du plugin au lieu
de l'arbre de fichiers générique.

**La leçon du 01/09 s'applique telle quelle** : l'atelier s'affichait deux fois,
sa tuile de plugin à côté de la tuile du dossier dont il est une vue. Correctif
retenu : le plugin ne livre pas de `tile`, il reste chargé, gardé et surtout
routable. Faire pareil ici — la porte d'un programme, c'est son dossier.

La vue est **une descente récursive**, pas N écrans : le même composant dessine
un programme et un sous-sous-sujet. C'est ce qui rend la profondeur infinie
gratuite plutôt que coûteuse.

## Les blocs : deux axes, la PROVENANCE et la PORTÉE

Aucun des deux n'est « à quoi ça ressemble ». La **provenance** dit d'où la
donnée arrive, et c'est elle qui décide du coût. La **portée** dit de QUI est
la donnée — la fiche, ses enfants, ou tout ce qui est en dessous — et c'est
elle qui décide de ce qu'il faut pouvoir lire.

Le propriétaire a nommé le besoin le 04/09 : les blocs voulus sont un mélange
de **contenu propre**, de **contenu des sous-éléments** (les statuts des
sous-projets, vus depuis le programme) et de **blocs d'un type donné remontés
des sous-éléments** (toutes les tâches liées dans un projet). Ce sont trois
portées, pas trois familles de blocs — et les traiter comme un attribut plutôt
que comme trois inventaires est ce qui empêche le catalogue de tripler.

### La portée : un attribut, trois valeurs

| `scope` | Ce que le bloc montre | Ce qu'il faut lire |
|---|---|---|
| `self` (défaut) | ce que la fiche écrit | la fiche, déjà chargée — coût nul |
| `children` | les enfants directs | leur entête (`fields` de l'index) |
| `subtree` | tout ce qui est en dessous, à profondeur quelconque | idem, plus profond |

Un `:::risks scope=subtree` sur un programme montre alors les risques écrits
dans les projets ; un `:::decision scope=subtree state=open` montre ce qui
attend un arbitrage n'importe où sous soi ; un `:::actions scope=subtree` sur un
projet donne toutes ses tâches. **Un seul bloc par sujet, à toutes les
hauteurs** — au lieu d'un `risks` et d'un `risks-consolidés`, qui divergeraient
comme les tables de statut du prédécesseur.

**Une remontée renvoie, elle ne recopie pas.** Chaque ligne remontée porte la
fiche qui l'a écrite et ouvre dessus. C'est ce qui garde une seule source de
vérité : le risque vit dans le projet qui le court, le programme le regarde.

### Le coût de la portée, et il n'est pas nul

`/api/pages/index` publie aujourd'hui `path`, `title`, `fields` et `finished` —
**l'entête, pas le corps**. Donc :

- `scope=children` et `scope=subtree` sur des **entêtes** (statut, porteur,
  échéance d'un sous-projet) sont **gratuits** dès que l'index arrive au
  lecteur : c'est le préalable nº 2, rien de plus.
- Une remontée qui lit des **blocs** dans les fiches enfants (les lignes d'un
  `:::risks`, le texte d'un `:::decision`) demande le CORPS de chaque
  descendant. Deux façons, et c'est une question ouverte : soit le client va
  chercher N pages (N requêtes, et un écran qui charge), soit l'index publie un
  résumé par bloc — le serveur parse déjà chaque page dans cet endpoint, donc
  ce n'est pas un nouveau parcours de disque, c'est un champ de plus.

**Recommandation : commencer par les portées d'entête**, qui couvrent « les
statuts des sous-projets au niveau du programme » et « toutes les tâches d'un
projet » — les deux cas que le propriétaire a cités — et ne payer la remontée
de blocs que le jour où un `:::risks` consolidé est réellement demandé. La
distinction à garder en tête : **une tâche est une PAGE** (`type: tache`), donc
`:::actions scope=subtree` est une requête d'entêtes ; un risque est un BLOC,
donc `:::risks scope=subtree` est la version chère.

### Rédigés — `content: flow`, le texte est dans la fiche

Coût nul **en `scope=self`** : c'est la mécanique de `callout`, qui tourne déjà.
Les deux mains écrivent, l'éditeur de blocs marche sans une ligne de plus. Les
mêmes blocs en portée plus large deviennent des requêtes — cf. le coût ci-dessus.

| Bloc | Contenu | Attributs |
|---|---|---|
| `:::summary` | des paragraphes | `by`, `on` |
| `:::figures` | une liste `- Avancement: 62 % — 8 lots sur 13` | — |
| `:::risks` | un tableau markdown (gravité, risque, parade, porteur) | `view=table\|cards` |
| `:::options` | un `###` par option, `+`/`−` en listes | `chosen` |
| `:::decision` | des paragraphes | `due`, `by`, `state=open\|taken` |

### Requête — `content: empty`, le bloc porte un critère

| Bloc | Attributs | Ce qu'il interroge |
|---|---|---|
| `:::children` | `scope=children\|subtree`, `sort`, `view=rows\|cards`, `closed=fold\|hide\|show` | **le dossier de la fiche** — plus aucun `of` à écrire, la hiérarchie est là où le fichier est. |
| `:::actions` | `scope`, `status`, `owner`, `since`, `view=feed\|list` | les tâches de `todo`. **Ne pas inventer un second jeu** — cocher d'un côté coche de l'autre. |
| `:::contributors` | — | dérivé des fiches enfants et de leurs actions |

**Le rattachement d'une tâche à un item a deux chemins, et il faut les deux** :
la tâche vit sous le dossier de l'item, **ou** elle porte `projet: <id>`. La
capture rapide de `todo` classe dans UN dossier unique (`taches` en français),
donc la seule règle « par l'emplacement » raterait toutes les tâches saisies au
vol. Vérifié dans `plugins/todo/skills/todo/SKILL.md`.

### Le dossier — ce qu'il contient d'autre que des items

Un dossier ne contient pas que des sous-chantiers. Il contient des **pages de
contenu** — un compte rendu, une note d'architecture, un cahier des charges,
sur des sujets divers — et des **pièces jointes** : les documents posés à côté.
Deux blocs de plus, et tous deux tombent de l'arborescence sans rien déclarer.

| Bloc | Attributs | Ce qu'il montre |
|---|---|---|
| `:::pages` | `scope=self\|subtree`, `sort`, `view=rows\|cards` | les pages markdown du dossier qui ne sont **pas** des items et **pas** l'index — le contenu rédigé qui appartient à ce chantier |
| `:::attachments` | `scope=self\|subtree`, `kind`, `view=rows\|grid` | les fichiers non-markdown du dossier et de son `assets/` |

**`:::attachments` est déjà servi, et sa convention est déjà écrite** :
`GET /api/files?page=<chemin>` (`packages/server/src/files.ts`) renvoie les
fichiers non-markdown du dossier de la page **plus** tout ce qui vit sous son
`assets/`, avec le type, la taille et la date. Le commentaire de la fonction dit
pourquoi elle est là et pas ailleurs : « la convention vit ICI plutôt que d'être
re-dérivée par le shell, par un plugin, et finalement différemment par les
deux ». Rien à inventer — et surtout rien à re-décider. Le `?under=` du même
endpoint parcourt récursivement : c'est le `scope=subtree`, gratuit lui aussi.
Deux choses que la lecture du code apprend et qu'il ne faut pas défaire : le
markdown est exclu (« une page n'est pas une pièce jointe : elle a son API, son
vocabulaire et son écran »), et les fichiers des **sous-dossiers** sont exclus
de la portée `self`, sinon un dossier de projet afficherait comme siens les
documents de chacun de ses enfants.

### La règle qui sépare un item d'une page de contenu

Elle est nécessaire dès qu'un dossier mélange les deux, et elle doit être **une
seule** : **un item est une page dont le `type:` a un workflow déclaré dans
`pm-config`.** Tout le reste du dossier est du contenu.

C'est la meilleure des règles disponibles parce qu'elle ne coûte aucun champ
supplémentaire et qu'elle se justifie d'elle-même : ce qui a un cycle de vie
est un chantier, ce qui n'en a pas est un document. Elle rend aussi cohérente
la feuille — un sujet sans enfants reste une page simple dans le dossier de son
parent, et c'est son `type:` qui le distingue du compte rendu posé à côté.

### Le temps — phases, où l'on en est, jalons

Un bloc de plus, `:::timeline`, et c'est **le même bloc aux deux portées** —
c'est l'illustration la plus nette des deux axes.

| `scope` | Provenance | Ce qui est dessiné |
|---|---|---|
| `self` | **rédigé** — les phases sont dans le bloc | le découpage propre à ce chantier |
| `children` / `subtree` | **requête** — une bande par item en dessous | le planning consolidé, sans le ressaisir |

En portée `self`, le bloc est une liste, et c'est la mécanique existante :

```
:::timeline{scale=months}
- Cadrage: 2026-01-15 → 2026-03-01
- Réalisation: 2026-03-01 → 2026-09-30
- Recette: 2026-06-01
:::
```

**Une ligne à deux dates est une phase, une ligne à une date est un jalon.**
Pas de second inventaire, pas de `:::milestones` séparé : même argument que
pour la portée — deux blocs qui disent la même chose divergent.

**« Où l'on en est » ne demande AUCUN champ.** Le trait d'aujourd'hui est
gratuit — le navigateur connaît la date — et la phase courante est celle qui le
contient. Le reste vient du statut : un item que `isFinished()` déclare fini est
dessiné fait, sans qu'on lui ajoute un pourcentage à tenir à jour. C'est le
workflow qui colore le planning, et il n'y a qu'une table.

**Ce que la portée large exige, en revanche, c'est deux champs sur les items** :
`start:` et `due:`. `due:` est déjà le mot de `todo` — le reprendre à
l'identique, ne pas inventer `echeance:` à côté. C'est le seul endroit où ce
plugin demande aux fiches de l'utilisateur de porter des champs qu'il nomme :
les types sont libres, les dates ne peuvent pas l'être, sinon il n'y a pas de
planning. Un item sans dates ne casse rien — il n'a pas de bande, et le bloc le
dit plutôt que de deviner.

**Non-buts, explicitement.** Pas de flèches de dépendance entre phases, pas de
chemin critique, pas de charge ni d'allocation. Une dépendance est un GRAPHE, et
ce dépôt en a déjà un : `dev-flow` lit les `depends_on:` d'une galaxie de dépôts
et sait dire qui bloque qui. Un planning qui se met à porter des flèches devient
MS Project — même signal d'arrêt que le `OR` dans une requête.

**Homonyme à ne pas confondre** : le plugin `planif` de cette instance planifie
des **tours d'agent** (du cron), pas des phases de chantier. Aucun réemploi
possible, aucune collision réelle — mais le nom est proche et le prochain
lecteur le supposera.

### Asset voisin — `content: empty` + `source`

| Bloc | Attributs | Donnée |
|---|---|---|
| `:::progress` | `source` (requis) | un `./assets/project-management.json`, patron de `parcours` |

**À n'ouvrir que si une courbe est réellement demandée** : pour quatre chiffres,
`:::figures` suffit et ne coûte aucun contrat d'agent.

### La famille qui reste FERMÉE — et où passe exactement la frontière

Un bloc qui appellerait l'API d'un plugin (git, dev-flow) transformerait « le
rendu est du code déterministe » en « le rendu dépend du réseau » : chargement,
erreur, cache, et un écran qui ment quand la forge est en panne. Décision
séparée, pas dans ce plugin.

**La frontière n'est donc pas « aucun fetch »** — l'index, `/api/files` et un
asset voisin en font tous un. Elle est : **le bloc ne dépend de rien
d'extérieur à l'instance**. Ce que le disque local sait, un bloc peut le
demander ; ce qu'il faut aller chercher au dehors, non.

## L'agencement : ce que la fiche montre, et comment

Deux questions distinctes, et les confondre est le piège.

**QUELS blocs — la fiche décide, en les écrivant.** Une fiche qui n'a pas de
risques n'écrit pas `:::risks`. C'est la mécanique existante, elle ne coûte
rien, et elle garde une seule source de vérité : ce qui est à l'écran est ce
qui est dans le fichier.

**COMMENT ils sont posés — le bloc déclare son ampleur, la page son gabarit.**
Le bloc dit `pleine` ou `demie` dans son spec ; la page choisit un gabarit dans
son entête. On passe de *N!* dispositions à *N × 3*, et **la page ne peut
jamais positionner un pixel** — c'est la borne qui empêche le gabarit de
devenir du CSS écrit à la main dans du frontmatter.

**Le défaut vient du `type:`, via la configuration.** `pm-config` associe à
chaque type de l'utilisateur son gabarit — et son workflow, et son icône. Un
`sujet` s'ouvre donc déjà disposé comme les autres sujets, sans que personne
répète le réglage deux cents fois, et une fiche peut toujours le contredire
dans son entête. Patron : `todo-config`.

**Question ouverte, à trancher avant de coder** : est-ce que la vue se contente
de DESSINER les blocs que la fiche contient (recommandé : une source de vérité,
et l'éditeur de blocs marche déjà), ou est-ce qu'elle COMPOSE une fiche à
partir du gabarit de son type, en dessinant des blocs absents du fichier ? La
seconde donne une fiche vide déjà structurée, au prix d'un écran qui ne dit
plus ce que le fichier dit. Si le besoin est « une fiche neuve part avec les
bons blocs », le gabarit est un **échafaudage à la création**, pas une couche
de rendu — et c'est beaucoup moins cher.

## Workflow et statut final

**L'utilisateur choisit les états, le plugin impose qu'il y ait une fin.**

`pm-config` déclare, par type, une suite ordonnée d'états :

```yaml
workflows:
  projet: [idée, en cours, bloqué, clos]
  sujet:  [en réflexion, en cours, décidé]
```

L'item porte l'état courant dans `status:` — **le champ qui existe déjà**.

### La contrainte, et pourquoi elle s'écrit toute seule

`packages/content/src/status.ts` tient une table de statuts avec trois familles
(`underway`, `waiting`, `settled`) et un `isFinished()` que
`/api/pages/index` publie pour chaque page. **Le shell replie déjà les pages
finies avec.** Le commentaire du fichier dit pourquoi il vit dans le moteur de
contenu : le prédécesseur gardait une copie de la table par vue, et elles ont
divergé — `voyages` archivait un voyage que l'écran de section montrait encore
vivant.

D'où la règle, qui est exactement le « consistant avec le reste » demandé :

> **L'état terminal d'un workflow doit être un mot que `status.ts` classe déjà
> `settled`** — `clos`, `terminé`, `fait`, `réalisé`, `archivé`, `done`,
> `closed`, `décidé`, `choix fait`. Un workflow dont le dernier état n'en est
> pas un est **refusé**, avec le message qui dit lesquels sont acceptés.

Ce que ça achète, pour zéro ligne de code : le repli marche dans la vue du
plugin, dans le shell, dans l'index, et de la même façon. Ce que ça coûte :
l'utilisateur ne peut pas appeler « livré » son état final. C'est le bon prix —
la liberté est sur les états intermédiaires, qui sont les siens.

Les états intermédiaires inconnus de la table retombent sur `underway`, qui est
la direction sûre : **ils restent visibles**. Un mot que la table connaît comme
`waiting` (`bloqué`, `en attente`, `commandé`) prend sa couleur au passage,
gratuitement.

### Ce que le repli donne à la vue

`:::children` sépare les vivants du reste et met les finis dans un pli — même
geste que le shell, même verdict, même mot. L'attribut `closed=fold|hide|show`
permet à une fiche de revue de tout montrer sans changer la donnée.

## La contrainte qui borne tout

Dans `AttributeSpec`, **les valeurs d'attribut sont des chaînes**
(`packages/schemas/src/plugin.ts`, validé serveur dans `validate.ts`). Une
requête doit tenir en `champ=valeur`, avec un jeu fermé quand il y en a un.
C'est une limite, et elle est saine : une requête qui n'y tient pas est une
requête que personne ne relira. Le jour où il faut des `OR` et des parenthèses,
on réinvente SQL dans une directive — **signal d'arrêt, pas défi à relever**.

## Ce que le manifeste déclare

Des **données**, pas du code : le serveur valide les fiches sans pouvoir
exécuter un module écrit pour un navigateur (patron `parcours`).

```json
"vocabulary": {
  "summary":  { "content": "flow",  "attributes": { "by": {}, "on": {} } },
  "children": { "content": "empty", "attributes": {
                  "scope":  { "values": ["children", "subtree"], "default": "children" },
                  "view":   { "values": ["rows", "cards"], "default": "rows" },
                  "closed": { "values": ["fold", "hide", "show"], "default": "fold" } } },
  "timeline": { "content": "flow",  "attributes": {
                  "scope":  { "values": ["self", "children", "subtree"], "default": "self" },
                  "scale":  { "values": ["weeks", "months", "quarters"], "default": "months" } } },
  "attachments": { "content": "empty", "attributes": {
                  "scope":  { "values": ["self", "subtree"], "default": "self" },
                  "view":   { "values": ["rows", "grid"], "default": "rows" } } }
}
```

`scope` est le même mot partout, avec le même sens : c'est ce qui permet
d'ajouter une portée à un bloc sans ajouter un bloc. `timeline` est
`content: flow` **parce que sa portée `self` porte du texte** — un bloc peut
avoir du contenu et l'ignorer quand sa portée le dépasse ; l'inverse serait
impossible.

**Pas de champ `types`** (ils appartiennent à l'utilisateur) et **pas de
`tile`** (la porte est le dossier). Le vocabulaire des blocs, lui, reste
réservé au démarrage comme celui de n'importe quel plugin.

## Le préalable — ne PAS commencer par ce plugin

Trois chantiers le précèdent, et chacun vaut le coup tout seul :

1. **Identité** — `id:` sur les fiches, le tour de fond qui frappe et répare.
   Cf. `DESIGN.md`, journal du 27–29/08. **Rien n'est codé.** Le passage à une
   hiérarchie de fichiers en réduit l'urgence pour l'arbre lui-même (un dossier
   se déplace tout entier) mais pas pour `:::actions` : `projet:` de `todo`
   contient un **id**, pas un chemin, et c'est précisément une référence qui
   doit survivre au `mv`.
2. **L'index au lecteur** — `/api/pages/index` sert déjà `path`, `title`,
   `fields` et `finished` pour chaque page (`packages/server/src/pages.ts`),
   c'est-à-dire tout ce que `:::children` et `:::actions` demandent. Mais il ne
   parvient PAS jusqu'au Reader, dont le contexte ne porte que `base`, `blocks`
   et `openPage`. C'est le seul ajout d'architecture du dossier, et il relit
   tout le disque à chaque appel : c'est aussi le moment de payer cette dette.
3. **Références typées** — résolution à quatre étages, référence perdue
   affichée, puce générique tirée de `status.ts`.

**Codé avant ça, le plugin devrait inventer sa propre résolution — et ce serait
la mauvaise, comme le `.filter(Boolean)` de `todo` l'a montré.**

## Voisinage — `dev-flow`, l'ancien `lots`

`lots` a été **renommé `dev-flow`** (`89ead55`) et livré : il lit les fiches
`.agent/lots/` d'une galaxie de dépôts, chacune portant un `id:` et des
`depends_on: [ids]` **venus du dehors** (`tessera-2`). Il refuse une fiche sans
`id` et signale un désaccord entre l'id et le nom de fichier
(`plugins/dev-flow/read.mjs`).

C'est la couche d'identité arrivée par un autre chemin, et **son premier client
réel tourne déjà**. Avant de coder ici : confronter les deux contrats — deux
plugins qui inventent chacun leur notion d'identifiant, c'est la régression que
l'audit du 21/08 a nommée.

## Les questions ouvertes, à trancher avant de coder

1. **Le marqueur d'appartenance** : à quoi la vue reconnaît un chantier.
   Recommandation en deux temps, tous deux tenus par `pm-config` : il **nomme
   les racines** (où l'arbre commence) et il **déclare les workflows par type**
   (donc quels types sont des items). Reste à confirmer que ces deux
   déclarations suffisent, et qu'aucune fiche n'a besoin de se marquer
   elle-même.
2. **Gabarit = rendu ou échafaudage ?** La vue dessine-t-elle ce que le fichier
   contient, ou compose-t-elle depuis le type (recommandation : échafaudage).
3. **`:::contributors` est-il vraiment une requête ?** « Dernière contribution »
   n'est dérivable que si les actions sont des fiches. Sinon c'est un bloc
   rédigé déguisé — et il vaut mieux l'assumer que faire semblant de calculer.
4. **Les deux champs de date.** `start:` et `due:` sur un item sont le seul
   vocabulaire que ce plugin impose aux fiches. Confirmer les mots — `due:`
   vient de `todo` et doit rester tel quel ; `start:` n'a pas de précédent dans
   ce dépôt et se décide maintenant, pas à l'implémentation.
5. **Le coût de la remontée de BLOCS** (par opposition aux entêtes) : N requêtes
   côté client, ou un champ de plus dans l'index. À trancher le jour où un
   `:::risks scope=subtree` est demandé, pas avant.
6. **Les données réelles.** Ce sont elles qui trancheront les noms de blocs et
   la liste d'attributs. Rien ne se fige avant.

## La maquette

Quatre planches, chaque section étiquetée par son bloc et sa famille, plus le
catalogue : https://claude.ai/code/artifact/25c466c2-f5e5-48b7-82b0-c2e596dd5142

**Elle est antérieure aux décisions du 04/09** : elle montre trois profondeurs
nommées et une disposition figée. Elle vaut encore pour la composition d'une
fiche et l'allure des blocs ; elle ne vaut plus pour la hiérarchie ni pour les
types. Les données y sont inventées.
