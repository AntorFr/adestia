# Questions du chantier multi-magasins

> Tenue à jour à chaque échange. Une question ouverte n'est jamais close par
> l'assistant : elle attend une réponse du propriétaire, ou elle est reprise.
> À supprimer avec la lettre de mission quand la fonctionnalité est livrée.

## Résolues

**R1 — Le mode `ro` / `rw` par magasin ?** → **Supprimé.** Tout magasin est en
écriture ; le déclarer en lecture seule ne fait que déplacer l'échec vers un
refus incompréhensible pour l'utilisateur final. Reste à traiter le refus du
*disque* (dataset `2770`) en 403 nommant le magasin, pas en 500.

**R2 — Où atterrit une écriture ?** → **Là où on peut la déduire ; on demande
sinon.** Fiche existante → son magasin. Création dans un dossier porté par un
seul magasin → ce magasin. Création dans un dossier porté par plusieurs →
refus explicite listant les candidats, et la question est posée (au front par
l'API, à l'utilisateur par l'agent).

**R3 — Comment adresser l'exemplaire non prioritaire ?** → **`?store=<id>`**,
produit uniquement par la vue dossier, jamais canonique, jamais copié, et
retombant sur la résolution nue si le magasin cité ne porte plus le chemin.
Écarté : le suffixe dans l'URL — il est *contextuel* (il n'existe que tant que
le conflit existe), donc l'URL dépendrait d'un fichier d'un autre magasin.

**R4 — L'URL porte-t-elle le nom de fichier ?** → **Non : chemin moins
l'extension** (niveau 1 ; le slug déclaré est écarté). Le traducteur : un seul
candidat → lui ; le principal parmi les candidats → le principal ; plusieurs
annexes et pas de principal → indécidable, on remonte au dossier parent. Le
`.md` reste sur le disque, dans le document (`resolveHref` distingue page et
fichier par l'extension) et dans l'API.

**R5 — Le suffixe de magasin dans le titre ?** → **À l'affichage seulement**,
jamais dans le `title:` du fichier. Pas de conflit → jamais de suffixe.
Conflit principal / annexe → le principal garde son titre nu. Conflit entre
annexes → toutes suffixées.

**R6 — Qui est le magasin principal ?** → **Un réglage** (`workspace.primary`),
défaut = le premier déclaré. C'est une propriété de la *coque*, pas de la
mémoire : `famille` est principal sur Nestor et annexe sur Alfred. Remplace la
règle nº 3 du prédécesseur — la précédence par ordre de déclaration se réduit
à « le principal, puis le reste », l'ordre ne servant plus qu'à l'affichage.

## Ouvertes

**O1 — Cas 3 quand le dossier parent appartient à un plugin.** *(la plus
ancienne, signalée puis laissée en route)* « On remonte d'un cran, forcément un
dossier, donc forcément affichable » a une exception : un dossier absorbé par
un plugin (`owners.ts`) n'ouvre pas la mosaïque générique. `domaines/voyages`
ouvre l'app Voyages, qui n'a aucune raison de montrer les deux jumelles.

**O2 — Où se déclarent les magasins ?** Fichier de config seul
(`workspace.stores` + `workspace.primary`) ou aussi une surcharge
d'environnement. *(posée trop tôt, mise en attente)*

**O3 — Le rouge préexistant sur `main`.** Le round-trip d'un bloc à attributs
multi-lignes échappe ses `:::` — corruption de page à chaque `PUT`. Chantier
séparé : quand l'ouvre-t-on ?

**O4 — Feux verts en attente.** Pousser `main` ; pousser le dépôt de config
`skippy` (3 commits locaux).
