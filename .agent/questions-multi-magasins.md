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

**R7 — Que fait le cas 3, concrètement ?** → **On remonte toujours à l'URL du
dossier parent**, sauf si on y est déjà. C'est une vraie navigation : l'adresse
de la barre change, on n'affiche pas un autre contenu sous l'adresse demandée.
L'objection du dossier absorbé par un plugin tombe avec R8 — l'app Voyages
montrera les fiches de tous les magasins.

**R8 — Un plugin voit-il le système de fichiers ?** → **Jamais.** Décision
d'architecture : le noyau expose lister / résoudre / lire / écrire sur des
chemins **logiques** portant leur `store`, et garde pour lui l'organisation
physique (combien de racines, dans quel ordre, où s'applique la garde).
`pagesRoot` quitte le contrat de plugin. Corrige une phrase de la lettre de
mission — « les plugins : rien à faire » — vraie du front, fausse des API de
plugins, qui marchent l'arbre elles-mêmes et deviendraient aveugles au
magasin partagé, en silence.

**R9 — Chemin FS et chemin dans l'arbre.** → **Séparés.** Un magasin déclare
`path` (le disque) et `at` (le point de montage, défaut : la racine). Monté à
la racine il FUSIONNE ; monté plus bas il ségrège dans un sous-arbre visible.
Déplacer une fiche vers un magasin monté en profondeur est un déplacement dans
l'arbre, pas une casse de la règle nº 1 — et un déplacement a toujours changé
une adresse.

**R10 — Où est monté le magasin par défaut ?** → **Au niveau 0**, et `at` lui
est interdit : l'arbre a toujours une racine.

**R11 — Comment le CLI sait-il où naviguer ?** → On le lui **dit**. Son contrat
livré devient généré et porte la table (id, libellé, chemin disque, montage) et
la règle d'écriture. C'est le seul endroit où divulguer la disposition physique
est légitime : l'agent est le seul auteur qui travaille sur des fichiers. Note :
le contrat statique écrit déjà `pages/` en dur, ce qui est faux sur une instance
qui a renommé le dossier.

**R12 — `pagesRoot` : remplacement ou cohabitation ?** → **Remplacement net**,
déduit du « jamais » de la décision d'architecture : un `pagesRoot` déprécié,
c'est un plugin qui continue d'appeler le FS. Les 4 plugins sont portés ici.

**R13 — Où se déclarent les magasins ?** → **Dans le fichier de config seul**
(réglé par la forme même de la config qu'on a écrite ensemble). Une variable
d'environnement ne porterait que le chemin, pas le libellé ni la teinte — et
`workspace.pages` n'a jamais été surchargeable par l'environnement.

**R14 — Comment l'agent atteint-il des magasins hors de `root` ?** → **On les
lui déclare**, il garde ses outils natifs. Capacité de pilote déclarée
(`additionalDirectories` côté claude-code) ; repli « sous `root` » annoncé au
boot sur un pilote qui ne l'a pas. Écarté : lui servir notre propre API de
fichiers — ça lui coûterait `Grep` (chercher sa mémoire par le contenu) et
`Edit`. Écarté aussi : imposer que tout soit sous `root`, qui rendrait à
l'opérateur la disposition physique dont on vient de le décharger. La moitié
POSIX du problème (dataset `2770`, gid 3002) ne dépend d'aucune des trois voies :
c'est `supplementalGroups` dans le pod.

**R15 — Comment se rend l'appartenance à un magasin ?** → **Liseré + onglet +
légende.** Un liseré de la teinte du magasin sur tout le pourtour de la carte
(formule du survol : 45 % mêlés à la bordure) ; un onglet CARRÉ collé dans le
coin haut droit portant les DEUX premières lettres du magasin, coin interne au
rayon de la carte ; une légende sous le titre du dossier, qui dit aussi ce que
l'absence de marque signifie. Rien dans le pied de carte : il appartient au
statut et aux tags, et une puce de provenance s'y confond dès qu'il y en a
trois. Écarté : le point rond, qui est le vocabulaire du statut. Le magasin par
défaut ne porte rien — un liseré sur toutes les cartes n'est plus un signal, ce
qui clôt aussi la question « faut-il marquer le défaut ». Vu en clair et en
sombre avant d'être écrit.

**R17 — La collision `.adestia-card`.** → **Corrigée.** Ce n'était pas un bloc
mort mais DEUX composants portant le même nom : les cartes de page
(`Section.tsx`) et les fiches d'instructions (`Instructions.tsx`), chacun
écrasant l'autre. Les fiches deviennent `.adestia-filecard` ; les cartes de
page retrouvent leur rayon, leur remplissage et le pied à retour à la ligne ;
le `:focus-visible` qui vivait dans le bloc renommé est rendu aux deux. Vu au
banc, les deux écrans, les deux thèmes (`bench/scenarios/card-families.mjs`).

## Trouvé en posant le témoin (étape 0)

Deux comportements d'aujourd'hui que le témoin **fige tels quels** — le figer
n'est pas les approuver, c'est empêcher qu'ils changent en douce pendant le
chantier. À traiter à part, et en régénérant le témoin sciemment.

**T1 — Le fichier `.tmp` de sauvegarde est listé comme pièce jointe.**
`pages.ts` écrit `<page>.<uuid>.tmp` puis renomme (écriture atomique). Or
`files.ts` n'exclut que les points et le `.md`, donc pendant cette fenêtre
`GET /api/files?page=…` rend le `.tmp`. `watch.ts` connaît déjà cette classe
(« un `.tmp` en cours de sauvegarde n'est pas une page ») ; `files.ts` non.

**T2 — Le tri de `/api/pages` n'est pas celui d'un corpus français.**
`pages.ts` trie avec `paths.sort()`, donc par unités UTF-16 : `Ébène.md` arrive
APRÈS `zinc.md`. `files.ts`, lui, trie avec `localeCompare`. Deux routes
voisines, deux ordres.

## Ouvertes

**R16 — Le « rouge préexistant sur `main` ».** → **Ne se reproduit pas, et
l'alerte était infondée.** Le round-trip a échoué deux fois puis est repassé
au vert dans les DEUX checkouts, au même commit et avec la même fixture ;
relancé deux fois de plus, stable. Le test lit les sources TypeScript (alias
vitest), donc l'hypothèse d'un `dist` périmé ne tient pas non plus. Cause non
établie — le seul événement intercalé est le premier `npm run build` qui ait
réussi de bout en bout. Ce qui est établi : l'annonce « corruption de page à
chaque PUT » n'aurait pas dû être faite sur deux échecs non reproduits.

**O4 — Feux verts en attente.** Pousser `main` ; pousser le dépôt de config
`skippy` (3 commits locaux).
