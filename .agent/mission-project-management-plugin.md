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
7. **Un `:::` nomme un RENDU, pas un sujet.** On crée un bloc quand la
   représentation diffère ; on ajoute un attribut quand c'est le sens qui
   diffère. Douze blocs deviennent huit rendus, et créer une sorte de contenu
   ne coûte plus rien.

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

Un `:::table{type=risques scope=subtree}` sur un programme montre alors les risques écrits
dans les projets ; un `:::decision{scope=subtree state=open}` montre ce qui
attend un arbitrage n'importe où sous soi ; un `:::list{from=tasks scope=subtree}` sur un
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
  `:::table{type=risques}`, le texte d'un `:::decision`) demande le CORPS de chaque
  descendant. Deux façons, et c'est une question ouverte : soit le client va
  chercher N pages (N requêtes, et un écran qui charge), soit l'index publie un
  résumé par bloc — le serveur parse déjà chaque page dans cet endpoint, donc
  ce n'est pas un nouveau parcours de disque, c'est un champ de plus.

**Recommandation : commencer par les portées d'entête**, qui couvrent « les
statuts des sous-projets au niveau du programme » et « toutes les tâches d'un
projet » — les deux cas que le propriétaire a cités — et ne payer la remontée
de blocs que le jour où un `:::table{type=risques}` consolidé est réellement demandé. La
distinction à garder en tête : **une tâche est une PAGE** (`type: tache`), donc
`:::list{from=tasks scope=subtree}` est une requête d'entêtes ; un risque est un BLOC,
donc `:::table{type=risques scope=subtree}` est la version chère.

### Un `:::` est un RENDU, jamais un sujet

**La règle, et elle décide de tout le catalogue :**

> On crée un `:::` nouveau quand on veut une **représentation différente**.
> On ajoute un **attribut** quand on veut dire une **chose différente**.
> Autrement dit : *ça se dessine autrement ? → un bloc. Ça veut juste dire
> autre chose ? → un attribut.*

Le premier jet de cette lettre confondait les deux et déclarait un bloc par
sujet — `summary`, `scope`, `risks`, `livrables`… Neuf aujourd'hui, trente dans
un an, chacun avec son entrée de manifeste et son composant. Or `:::summary` et
`:::scope` se dessinent **exactement pareil** : un titre, de la prose. Leur
différence n'est pas un rendu, c'est un sens.

**Ce n'est pas une idée à inventer : le cœur l'applique déjà.**
`:::callout{type=note|tip|warning}` est un rendu unique dont le sujet est un
attribut ; `:::app{id=…}` de même. La dérive venait de cette lettre, pas du
produit.

Donc :

```
:::content{type=summary by=Antor on=2026-09-02}
Huit lots sur treize ; l'identité de fiche reste le chemin critique.
:::

:::content{type=perimetre}
Le socle de contenu et son shell, hors infra.
:::
```

Un seul bloc, un seul composant, et **le sujet est une valeur d'attribut** —
donc un mot qui appartient à l'utilisateur, exactement comme les types de fiche.

#### Ce que ça change, et c'est considérable

**Créer une nouvelle sorte de contenu ne coûte plus RIEN.** Ni code, ni entrée
de manifeste, ni redémarrage : `:::content{type=lettre-au-pere-noel}` est valide
le jour où on l'écrit, parce que le bloc `content` est déclaré une fois pour
toutes et que `type` est une chaîne libre. Toute la discussion « ouvrir ou
fermer le vocabulaire » **tombe** : le vocabulaire reste fermé — une poignée de
rendus — et l'espace des sujets est ouvert. C'était le bon découpage depuis le
début, et on le cherchait au mauvais endroit.

**La remontée s'exprime dans le même vocabulaire.** Une fiche parente ne demande
plus « le bloc `summary` de mes enfants » mais « le `content` dont le `type` est
`summary` » — une valeur d'attribut, pas un nom de bloc. Un seul mécanisme
d'adressage pour toutes les remontées.

**`pm-config` gagne un troisième registre** : le libellé et l'icône de chaque
sorte de contenu (`summary: Synthèse`, `perimetre: Périmètre`). Sans lui, le
rendu retombe sur la valeur embellie — `prettify()` existe déjà dans
`sections.ts` pour ça. Déclaré bat deviné, deviné bat disparu.

### Le catalogue, réduit à des rendus

| Rendu | Ce qu'il dessine | Le sujet vit dans |
|---|---|---|
| `:::content` | un titre et de la prose | `type=` — n'importe quel mot |
| `:::figures` | des chiffres en tuiles | — |
| `:::table` | un tableau, 1<sup>re</sup> colonne colorée par son ton | `type=risques`, `type=budget`… |
| `:::options` | des cartes `+`/`−`, une retenue | `chosen=` |
| `:::decision` | de la prose, une échéance, un état | `state=`, `due=` |
| `:::list` | des lignes : icône, titre, puces, date | `from=children\|tasks\|pages\|files` |
| `:::timeline` | des barres et des jalons dans le temps | `scope=` |
| `:::progress` | une courbe, depuis un asset voisin | `source=` |

**De douze noms à huit**, et surtout : les quatre premiers absorbent tout ce
qu'on voudra écrire, sans jamais rouvrir le manifeste.

**Ce qui reste à arbitrer, c'est la GRANULARITÉ**, et la règle ci-dessus est le
seul juge :

- `children`, `actions`, `pages` dessinent la même ligne → **un seul**
  `:::list{from=…}`. Recommandé.
- `attachments` dessine des cartes de fichiers, pas des lignes → soit
  `:::list{from=files view=grid}`, soit son propre rendu. **À trancher en
  regardant les deux dessins**, pas en raisonnant.
- `decision` reste séparé de `content` parce qu'il dessine en plus une échéance
  et un état ouvert/rendu. Si ce n'était qu'un titre différent, il fusionnerait.

### Rédigés — le texte est dans la fiche

Coût nul **en `scope=self`** : c'est la mécanique de `callout`, qui tourne déjà.
Les deux mains écrivent, l'éditeur de blocs marche sans une ligne de plus. Les
mêmes blocs en portée plus large deviennent des requêtes — cf. le coût ci-dessus.

| Écrit | Rendu | Contenu markdown |
|---|---|---|
| `:::content{type=summary by= on=}` | `content` | des paragraphes |
| `:::content{type=perimetre}` | `content` | des paragraphes — **rien à déclarer** |
| `:::figures` | `figures` | une liste `- Avancement: 62 % — 8 lots sur 13` |
| `:::table{type=risques}` | `table` | un tableau markdown |
| `:::options{chosen=}` | `options` | un `###` par option, `+`/`−` en listes |
| `:::decision{state= due= by=}` | `decision` | des paragraphes |

### Requête — `content: empty`, le bloc porte un critère

| Écrit | Attributs | Ce qu'il interroge |
|---|---|---|
| `:::list{from=children}` | `scope=children\|subtree`, `pull`, `sort`, `closed=fold\|hide\|show` | **le dossier de la fiche** — plus aucun `of` à écrire, la hiérarchie est là où le fichier est. |
| `:::list{from=tasks}` | `scope`, `status`, `since` | les tâches de `todo`. **Ne pas inventer un second jeu** — cocher d'un côté coche de l'autre. |

Les contributeurs ne sont pas une requête : voir la question ouverte qui leur
est consacrée. Écrits, ils sont un `:::content{type=contributeurs}` — donc rien
à déclarer.

#### Remonter, dans une ligne d'enfant, ce que l'enfant dit de lui

`pull=due,content:summary,content:perimetre` — une chaîne de noms séparés par
des virgules, ce qui tient dans la contrainte des attributs. Un nom nu désigne
un **champ d'entête** ; un nom préfixé désigne un **rendu et la valeur de son
attribut** (`content:summary` = « le `content` dont le `type` est `summary` »).
C'est cette différence qui décide du coût — pas le mot lui-même. Le défaut par
type vit dans `pm-config`, pour ne pas le répéter deux cents fois.

**Un champ d'entête est gratuit.** Vérifié : `parseFrontmatter`
(`packages/server/src/pages.ts`) prend n'importe quelle clé de premier niveau,
sans schéma ni liste blanche, et l'index la publie telle quelle. Trois limites,
lues dans le code : seules les clés de **premier niveau** entrent (une structure
indentée est délibérément ignorée, « deviner produirait un champ qui a l'air
interrogeable et ne l'est pas ») ; le shell ne **dessine** qu'un jeu fixe de
puces — `status`, `type`, `cat`, `role`, `tags` — donc un champ neuf est
interrogeable mais invisible dans l'entête de page du cœur ; et le mot `scope`
serait pris deux fois si un attribut de bloc le porte déjà (`depth=` dirait
mieux ce que fait l'attribut, et libèrerait le mot).

**Un bloc ne l'est pas, et le `type` n'y change rien.** Un
`:::content{type=perimetre}`, un `:::content{type=summary}`, un
`:::content{type=contexte}` sont le MÊME bloc : du texte dans le CORPS de la
fiche enfant, que l'index ne publie pas. Remonter l'un ou l'autre coûte
exactement pareil.

#### Ce que la remontée de blocs exige vraiment

C'est la conséquence à ne pas enterrer : **dès qu'une ligne d'enfant doit
montrer un bloc, la remontée de blocs cesse d'être un « plus tard si on le
demande » et devient une pièce du premier jet.** Trois façons :

1. **L'index publie un digest des blocs rédigés** — pour chaque page, le
   premier paragraphe de chaque bloc `flow`, tronqué. Le serveur lit déjà le
   fichier entier dans cet endpoint : c'est un champ de plus, pas un nouveau
   parcours de disque. Borné par construction (blocs `flow` seulement, un
   paragraphe, une longueur maximale) — et c'est cette borne qui l'empêche de
   devenir « l'index sert les pages ». **Recommandé.**
2. **Le client va chercher les N enfants** — chargement, erreurs, cache, et un
   écran qui clignote à cinquante enfants. C'est précisément ce que la famille
   fermée refuse.
3. **Un champ d'entête écrit à la main** (`resume:`) doublant le bloc — moins
   cher et pire : la même phrase à deux endroits finit par dire deux choses.

**Le préalable nº 2 change donc de contour** : ce n'est plus seulement « faire
descendre l'index jusqu'au lecteur », c'est « et lui donner de quoi citer un
bloc ». À décider AVANT de coder l'index, pas après.

#### Créer une nouvelle sorte de contenu — le coût est nul

La question se posait quand chaque sujet réclamait son bloc. Avec un rendu
porteur d'un attribut, elle disparaît :

- **Écrire `:::content{type=livrables}` suffit.** Le bloc `content` est déclaré
  une fois ; `type` est une chaîne libre ; la page reste valide, éditable, et
  le texte s'affiche dans une carte titrée. Ni code, ni manifeste, ni
  redémarrage.
- **Déclarer la sorte dans `pm-config` n'achète que du confort** : un libellé
  propre (« Livrables » plutôt que le mot embelli), une icône, une place dans
  le menu d'insertion. Rien de vital, donc rien de bloquant.
- **Un rendu VRAIMENT nouveau reste une affaire de code** — et c'est sain :
  ajouter une carte, un tableau ou une frise n'arrive que quand on veut voir
  autre chose, pas quand on veut dire autre chose.
- **Le vocabulaire peut donc rester fermé**, ce qui garde ses trois bénéfices
  intacts : la faute de frappe sur un RENDU est refusée, les attributs d'un
  rendu sont validés, et la skill a une liste courte à enseigner. La faute de
  frappe sur un SUJET (`type=sumary`) reste possible — c'est le prix de la
  liberté, et il se paie en visibilité : la vue signale les sorties de contenu
  que personne ne demande, plutôt que de les interdire.

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
| `:::list{from=pages}` | `scope=self\|subtree`, `sort` | les pages markdown du dossier qui ne sont **pas** des items et **pas** l'index — le contenu rédigé qui appartient à ce chantier |
| `:::list{from=files}` | `scope=self\|subtree`, `kind`, `view=rows\|grid` | les fichiers non-markdown du dossier et de son `assets/` |

**`:::list{from=files}` est déjà servi, et sa convention est déjà écrite** :
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

### Où vivent les dates — la question du stockage, tranchée

Deux modèles étaient possibles, et le choix décide de ce qu'une phase EST.

**Le modèle fermé** : un `.md` de type `timeline` qui liste des phases, chacune
avec ses deux dates. Explicite, mais une phase y est de la donnée morte — elle
ne peut pas porter de statut, ni de tâches, ni de synthèse — et surtout ça
ouvre un TROISIÈME endroit où le temps se déclare, à côté de l'entête des items
et du bloc rédigé. Trois sources sur les mêmes dates, c'est le motif de dérive
que ce dépôt a déjà payé deux fois.

**Le modèle ouvert, retenu** : *n'importe quel item qui porte des dates entre
dans le planning*. Il n'y a pas de type `timeline`, pas de fichier dédié, rien
à déclarer. Et ce n'est pas une concession à l'ouverture pour elle-même : c'est
la conséquence directe du modèle d'arbre — **une phase EST un item**. « Cadrage »
est un sous-chantier avec un début, une fin, un statut, ses propres tâches et sa
propre page ; sa bande sur le planning s'ouvre dessus. Le modèle fermé aurait
dessiné un rectangle sur lequel il n'y a rien à cliquer.

**Ce que ça coûte en vocabulaire : UN seul mot nouveau.**

| Ce que la fiche porte | Ce que le planning dessine |
|---|---|
| `start:` et `due:` | une **phase**, une bande du premier au second |
| `due:` seul | un **jalon**, un repère à cette date |
| ni l'un ni l'autre | rien, et le bloc le dit — jamais une date devinée |

`due:` est déjà le mot de `todo`, au même sens (« quand c'est dû »). Seul
`start:` est nouveau. Un jalon n'est donc pas un troisième objet : c'est une
phase sans commencement, ce qui est exactement ce qu'un jalon est.

**Qui est éligible** : les items de la portée, c'est-à-dire — même règle que
partout ailleurs dans cette lettre — les pages dont le `type:` a un workflow
déclaré. Sans ce filtre, les deux cents tâches d'une instance atterriraient sur
le planning ; elles ont déjà leur bloc, `:::list{from=tasks}`.

**Le cas du modèle fermé reste couvert** par la portée `self` : une phasage qui
n'est qu'un dessin — trois bandes sur un programme, sans page derrière — s'écrit
dans le bloc et ne crée aucun fichier. Et si quelqu'un veut vraiment ce dessin
dans un document à part, c'est une page de contenu du dossier portant le bloc.
Rien de spécial à prévoir.

**Reste ouvert, et c'est une question de MOTS, pas de modèle** : est-ce le
plugin qui fixe `start:`/`due:`, ou `pm-config` qui mappe les mots de
l'utilisateur (`dates: { start: debut, end: echeance }`) ? Les deux marchent
avec le modèle ouvert ; la seconde coûte deux lignes de config et une
indirection, et rend au propriétaire des fiches le dernier mot que le plugin
lui prenait.

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
risques n'écrit pas `:::table{type=risques}`. C'est la mécanique existante, elle ne coûte
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

### Par quel geste on choisit, concrètement

Trois gestes, et deux des trois existent déjà dans l'éditeur.

| Ce qu'on choisit | Le geste | Ce qu'il écrit | État |
|---|---|---|---|
| **Quels blocs** | ajouter par le menu slash, supprimer le bloc | la directive apparaît ou disparaît du fichier | Crepe fournit le menu slash ; **à vérifier** : que les blocs contribués par un plugin y figurent |
| **Dans quel ordre** | tirer la poignée du bloc | la directive change de place dans le fichier | **déjà là** — Crepe monte ses poignées de déplacement, et un bloc est un nœud de première classe du document, jamais du texte qui ressemble à une directive |
| **Quelle ampleur** | un interrupteur pleine/demie sur le bloc | `w=demie` dans les attributs de la directive | **manquant** — les attributs vivent dans le modèle (`vocabulary.ts` les porte en `attrs` et les sérialise) mais rien ne les édite |

Le troisième est donc le seul travail neuf, et il a deux formes possibles :

1. **L'interrupteur appartient au bloc.** C'est déjà le plugin qui dessine ses
   propres blocs, y compris dans l'éditeur (`Editor.tsx` passe les composants
   contribués), donc il peut dessiner dans l'entête du bloc le bouton qui
   écrit son propre attribut. Rien à changer dans le cœur, et chaque plugin
   garde la main sur ce qui se règle chez lui. **Recommandé.**
2. **Un formulaire d'attributs générique dans l'éditeur du cœur**, alimenté par
   l'`AttributeSpec` que le manifeste déclare déjà — les valeurs fermées
   deviendraient des menus, les libres des champs. Ça profiterait à TOUS les
   plugins et c'est probablement la bonne chose un jour, mais c'est un chantier
   de cœur, à ne pas faire passer en douce dans celui-ci.

Et si rien n'est construit : l'ampleur reste éditable à la main dans le
markdown, comme tout attribut. La disposition dégrade en une colonne, elle ne
casse pas.

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

`:::list{from=children}` sépare les vivants du reste et met les finis dans un pli — même
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
  "content":  { "content": "flow",  "attributes": {
                  "type":   { "required": true },
                  "scope":  { "values": ["self", "children", "subtree"], "default": "self" },
                  "by": {}, "on": {} } },
  "table":    { "content": "flow",  "attributes": {
                  "type":   { "required": true },
                  "scope":  { "values": ["self", "children", "subtree"], "default": "self" } } },
  "list":     { "content": "empty", "attributes": {
                  "from":   { "required": true,
                              "values": ["children", "tasks", "pages", "files"] },
                  "scope":  { "values": ["self", "children", "subtree"], "default": "children" },
                  "pull":   {},
                  "view":   { "values": ["rows", "cards", "grid"], "default": "rows" },
                  "closed": { "values": ["fold", "hide", "show"], "default": "fold" } } },
  "timeline": { "content": "flow",  "attributes": {
                  "scope":  { "values": ["self", "children", "subtree"], "default": "self" },
                  "scale":  { "values": ["weeks", "months", "quarters"], "default": "months" } } }
}
```

Trois choses à lire dans ce bloc.

**`type` est requis mais SANS `values`.** C'est là que passe la frontière : le
nom du rendu est fermé et validé, la sorte de contenu est une chaîne libre qui
appartient à l'utilisateur. Un `AttributeSpec` sans `values` accepte n'importe
quelle chaîne non vide — le mécanisme existe déjà, il n'y a rien à ajouter au
schéma.

**`scope` est le même mot partout, avec le même sens** : c'est ce qui permet
d'ajouter une portée à un rendu sans ajouter un rendu. Et `content`, `table` et
`timeline` sont `flow` **parce que leur portée `self` porte du texte** — un
bloc peut avoir du contenu et l'ignorer quand sa portée le dépasse ; l'inverse
serait impossible.

**`from` est fermé, lui.** Un `:::list` qui ne sait pas où regarder ne dessine
rien du tout : c'est exactement le cas où une faute de frappe est un rectangle
vide, donc exactement le cas où la validation vaut son prix.

**Pas de champ `types`** (ils appartiennent à l'utilisateur) et **pas de
`tile`** (la porte est le dossier). Le vocabulaire des rendus, lui, reste
réservé au démarrage comme celui de n'importe quel plugin.

## Le préalable — ne PAS commencer par ce plugin

Trois chantiers le précèdent, et chacun vaut le coup tout seul :

1. **Identité** — `id:` sur les fiches, le tour de fond qui frappe et répare.
   Cf. `DESIGN.md`, journal du 27–29/08. **Rien n'est codé.** Le passage à une
   hiérarchie de fichiers en réduit l'urgence pour l'arbre lui-même (un dossier
   se déplace tout entier) mais pas pour `:::list{from=tasks}` : `projet:` de `todo`
   contient un **id**, pas un chemin, et c'est précisément une référence qui
   doit survivre au `mv`.
2. **L'index au lecteur** — `/api/pages/index` sert déjà `path`, `title`,
   `fields` et `finished` pour chaque page (`packages/server/src/pages.ts`),
   c'est-à-dire tout ce que `:::list{from=children}` et `:::list{from=tasks}` demandent. Mais il ne
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
3. **Les contributeurs sont-ils un rendu, ou juste un contenu ?** « Dernière
   contribution » n'est dérivable que si les tâches portent un porteur — et
   **`todo` n'en définit aucun** (`done`, `due`, `pri`, `dom`, `projet`, `sub`,
   rien d'autre : vérifié). Tant que c'est vrai, ce n'est pas une requête mais
   un `:::content{type=contributeurs}`, qui ne coûte rien et ne ment pas. Un
   rendu dédié — pastilles, dernière trace — ne se justifie que le jour où il y
   a quelque chose à calculer.
4. **Les deux champs de date.** `start:` et `due:` sur un item sont le seul
   vocabulaire que ce plugin impose aux fiches. Confirmer les mots — `due:`
   vient de `todo` et doit rester tel quel ; `start:` n'a pas de précédent dans
   ce dépôt et se décide maintenant, pas à l'implémentation.
5. **Le coût de la remontée de BLOCS** (par opposition aux entêtes) : N requêtes
   côté client, ou un champ de plus dans l'index. À trancher le jour où un
   `:::table{type=risques scope=subtree}` est demandé, pas avant.
6. **Les données réelles — REPORTÉ** (04/09) : elles ne sont pas sur cette
   machine. Ce sont elles qui trancheront les noms de blocs et la liste
   d'attributs, donc ces deux-là restent ouverts jusqu'à ce qu'un corpus réel
   soit lisible d'ici. La conception peut avancer sans ; le figeage, non.

## La maquette

Quatre planches, chaque section étiquetée par son bloc et sa famille, plus le
catalogue : https://claude.ai/code/artifact/25c466c2-f5e5-48b7-82b0-c2e596dd5142

**Elle est antérieure aux décisions du 04/09** : elle montre trois profondeurs
nommées et une disposition figée. Elle vaut encore pour la composition d'une
fiche et l'allure des blocs ; elle ne vaut plus pour la hiérarchie ni pour les
types. Les données y sont inventées.
