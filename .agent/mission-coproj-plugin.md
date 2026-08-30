# Mission — plugin « coproj » : suivre un programme, ses projets, ses sujets

> Lettre de mission pour l'agent qui implémentera le plugin. **⚠️ À SUPPRIMER
> une fois l'implémentation terminée** (dans le commit final, avec le
> `status.md` à jour) : le contrat vivant sera le schéma du manifeste et la
> skill du plugin, cette lettre ne doit pas survivre comme deuxième source de
> vérité. Même règle que `mission-lots-plugin.md`.

## ⚠️ VERSION ALPHA — ce qui est ferme et ce qui ne l'est pas

**Ferme** : le découpage en trois familles de blocs, la hiérarchie par
`parent:`, la réutilisation des tâches de `todo`, et la couche d'identité dont
tout dépend (journal de décisions du 27–29/08 dans `DESIGN.md`).

**PAS ferme, et à retravailler avec Monsieur avant de coder** : les noms de
blocs, la liste exacte des attributs, et surtout **les données d'exemple**. La
maquette tourne aujourd'hui sur un jeu inventé (un programme « Homelab 2026»,
un projet « Adestia v1 ») ; Monsieur fournira des cas réels et parlants, et
c'est eux qui décideront des derniers arbitrages. **Ne pas figer un attribut
sur la foi d'un exemple fabriqué.**

## Le besoin

Voir l'état d'un chantier façon comité de projet : une **synthèse**, ce qui a
été **fait**, ce qui **vient**, les **risques**, les **contributeurs**. Et la
même vue à trois profondeurs — un **programme** contient des **projets**, un
projet porte des **sujets** en cours d'instruction.

## Le modèle : une seule page, trois profondeurs

Un programme, un projet et un sujet sont **la même page** : un `type:` du
plugin, plus un `parent:` qui vise la fiche du dessus. Ce qui change d'un étage
à l'autre n'est pas le gabarit, c'est **quels blocs la fiche contient**. Un
sujet n'ajoute que `:::options` et `:::decision`.

C'est ce qui rend la vue récursive au lieu de trois écrans à maintenir —
ajouter un quatrième étage ne coûte alors rien.

## Le préalable — ne PAS commencer par ce plugin

Trois chantiers le précèdent, et chacun vaut le coup tout seul. Les faire dans
l'ordre :

1. **Identité** — `id:` sur les fiches, `adestia id`, le tour de fond qui scelle
   et répare. Cf. `DESIGN.md`, journal du 27–29/08.
2. **L'index au lecteur** — le Reader dessine aujourd'hui un arbre sans rien
   savoir du workspace. C'est le seul ajout d'architecture du dossier, et il
   débloque à la fois les puces de référence et les blocs de requête ci-dessous.
   C'est aussi le moment de payer la dette de `/api/pages/index`.
3. **Références typées** — résolution à quatre étages, référence perdue
   affichée, puce générique tirée de `status.ts`.

**Codé avant ça, coproj devrait inventer sa propre résolution — et ce serait la
mauvaise, comme le `.filter(Boolean)` de `todo` l'a montré.**

## Les blocs, classés par PROVENANCE de la donnée

La taxonomie n'est pas « à quoi ça ressemble » mais **d'où la donnée arrive** :
c'est ça qui décide du coût.

### Rédigés — `content: flow`, le texte est dans la fiche

Coût nul : c'est la mécanique de `callout`, qui tourne déjà. Les deux mains
écrivent, l'éditeur de blocs marche sans une ligne de plus.

| Bloc | Contenu | Attributs |
|---|---|---|
| `:::summary` | des paragraphes | `by`, `on` |
| `:::figures` | une liste `- Avancement: 62 % — 8 lots sur 13` | — |
| `:::risks` | un tableau markdown (gravité, risque, parade, porteur) | `view=table\|cards` |
| `:::options` | un `###` par option, `+`/`−` en listes | `chosen` |
| `:::decision` | des paragraphes | `due`, `by`, `state=open\|taken` |

### Requête — `content: empty`, le bloc porte un critère

Coût moyen : demande un langage de requête **minimal et fermé**.

| Bloc | Attributs | Ce qu'il interroge |
|---|---|---|
| `:::children` | `of`, `sort`, `view=rows\|cards` | l'index : les fiches dont `parent:` vise celle-ci. **C'est lui qui fait la hiérarchie.** |
| `:::actions` | `type`, `status`, `owner`, `since`, `view=feed\|list` | l'index : les tâches. **Réutilise `todo`**, n'invente pas un second jeu — cocher d'un côté coche de l'autre. |
| `:::contributors` | `of` | dérivé des fiches enfants et de leurs actions |

### Asset voisin — `content: empty` + `source`

| Bloc | Attributs | Donnée |
|---|---|---|
| `:::progress` | `source` (requis) | un `./assets/coproj.json`, patron de `parcours`/`atelier`/`voyages` |

**À n'ouvrir que si une courbe est réellement demandée** : pour quatre chiffres,
`:::figures` suffit et ne coûte aucun contrat d'agent.

### La quatrième famille reste FERMÉE

Un bloc qui appellerait l'API d'un plugin (git, planif) transformerait « le
rendu est du code déterministe » en « le rendu dépend du réseau » : chargement,
erreur, cache. Décision séparée, pas dans ce plugin.

## La contrainte qui borne tout

Dans `AttributeSpec`, **les valeurs d'attribut sont des chaînes**. Une requête
doit tenir en `champ=valeur`, avec un jeu fermé quand il y en a un. C'est une
limite, et elle est saine : une requête qui n'y tient pas est une requête que
personne ne relira. Le jour où il faut des `OR` et des parenthèses, on réinvente
SQL dans une directive — **signal d'arrêt, pas défi à relever**.

## Ce que le manifeste déclare

Des **données**, pas du code : le serveur valide les fiches sans pouvoir
exécuter un module écrit pour un navigateur (patron `parcours`).

```json
"vocabulary": {
  "summary":  { "content": "flow",  "attributes": { "by": {}, "on": {} } },
  "children": { "content": "empty", "attributes": {
                  "of":   { "required": true },
                  "view": { "values": ["rows", "cards"], "default": "rows" } } }
},
"types": ["programme", "project", "topic"]
```

Types **en anglais** : règle d'écriture actée le 29/08 (les noms français
existants restent, ce sont des reliquats). Vérifier au passage qu'aucun autre
plugin ne revendique ces trois mots — la collision est déjà contrôlée au
démarrage, autant ne pas la provoquer.

## Deux questions ouvertes, à trancher à l'implémentation

1. **`:::contributors` est-il vraiment une requête ?** « Dernière contribution »
   n'est dérivable que si les actions sont des fiches. Sinon c'est un bloc
   rédigé déguisé — et il vaut mieux l'assumer que faire semblant de calculer.
2. **La disposition.** Si une fiche doit pouvoir mettre deux blocs côte à côte,
   faire déclarer au bloc son **ampleur** (`pleine`/`demie`) dans son spec, et à
   la page un **gabarit** dans son entête. On passe de *N!* dispositions à
   *N × 3*, et la page ne peut jamais positionner un pixel. **À ne construire
   que si le besoin se présente.**

## La maquette

Quatre planches, chaque section étiquetée par son bloc et sa famille, plus le
catalogue : https://claude.ai/code/artifact/25c466c2-f5e5-48b7-82b0-c2e596dd5142

Les données y sont **inventées** (cf. la note alpha en tête). La maquette dit la
structure et la composition, jamais le contenu.

## Voisinage — le plugin `lots`

`lots` (cf. `mission-lots-plugin.md`) visualise les chantiers de la galaxie
Tessera/Ostia, lus dans le git d'autres repos. Il a adopté de son côté un `id:`
en frontmatter et des `depends_on: [ids]` inter-repos, avec des identifiants
**venus du dehors** (`tessera-2`) : c'est exactement la couche d'identité
ci-dessus, arrivée par un autre chemin, et son premier client réel.

**Avant de coder l'un ou l'autre : confronter les deux contrats.** Deux plugins
qui inventent chacun leur notion d'identifiant, c'est le `type` réinventé quatre
fois qu'a trouvé l'audit du 21/08.
