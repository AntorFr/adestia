# Questions — chantier todo v2

> Fichier de travail. **Toutes tranchées le 08/09.** Ce qui suit est le contrat
> à implémenter ; les maquettes qui le portent :
> https://claude.ai/code/artifact/0b688c46-a21f-46df-8bc4-0c8bd0c3de30

## Ouvertes

Aucune. Ce qui reste est du travail, plus des décisions.

## Tranchées

### R1 — Qui est « moi » : les deux montages sont supportés
Une instance par personne (le dossier commun, `workspace.umask`) **et** une
instance à plusieurs comptes sont deux cas légitimes. La résolution est donc :

1. `me:` dans `todo-config` **s'il est écrit** — il l'emporte ;
2. sinon l'identité de la session (OIDC, proxy) ;
3. sinon rien, et la facette « Pour moi » ne s'affiche pas — mieux qu'une
   fausse.

⚠️ Conséquence obligatoire : `me:` se lit dans le store **par défaut**, pas
« le premier `todo-config` par ordre de chemin ». Sans ça, un réglage posé dans
le store famille imposerait son `me:` à toutes les instances qui le montent.
C'est le septième défaut de l'audit, que cette décision rend bloquant.

### R2 — Les deux mots neufs, confirmés
`start:` et `assignee:`.

La skill doit porter la phrase qui ferme le piège de `start` : **« pas avant »,
jamais « j'ai commencé »** — Taskwarrior emploie le mot dans l'autre sens, et
c'est le genre de confusion qu'on ne rattrape plus une fois le corpus écrit.

Un seul porteur, pas une liste : une tâche à deux porteurs n'en a aucun.
Absent = à prendre, qui est un état et non un vide.

### R3 — Un bloc dédié, pas `list{from=tasks}`
Un rendu porté par `todo`, qui affiche ET coche ET ajoute : **`:::checklist`**.
Nommé par ce qu'on y fait, puisque c'est le critère du 06/09 — « what separates
two renderings is what you can DO in them ». Pas `:::todo`, qui nommerait un
sujet.

Prix accepté d'avance : un bloc contribué disparaît avec son plugin, donc todo
éteint, une page qui en porte un ouvre en lecture seule avec un diagnostic.

Attributs : `page`, `view`, `assignee`, `dom`, `projet`, plus les deux
transverses du cœur — `depth` (`self` · `children` · `subtree`, défaut
`subtree`) et `w`. Ne pas réinventer `deep` : `depth` existe.

### R4 — Le bloc reçoit sa page
`BlockProps` gagne `path`, `store` et `fields`, avec les mots ET la sémantique
du layout : **`path` est le chemin LOGIQUE** — celui qui agrège les stores —
et `store` est un qualificatif présent seulement en multi-store, qu'on ne colle
jamais au chemin pour fabriquer une adresse.

Sans `path`, la portée par défaut passerait par `locate('.')`, qui rend `.`
pour une page à la racine. Sans `fields`, le rattrapage par `projet:` est
impossible — la capture rapide classe dans un dossier unique, donc une tâche
saisie au vol pour un chantier n'est jamais sous son dossier.

### R5 — Pas d'annuaire de personnes en v1
Les handles sont découverts en parcourant la base, comme les domaines le sont
déjà, et la teinte est dérivée du handle de façon stable. **Pas de
`type: personne`** : `type` est un espace de noms plat que rien n'arbitre, et
un annuaire de gens intéressera aussi le plugin chantiers — `todo` ne prend pas
ce mot pour tout le monde.

### R6 — L'index dit si une page a du texte
Un booléen par entrée, calculé là où le markdown est déjà lu pour en extraire
le frontmatter. La liste pose alors un 📝 sur les lignes concernées.

Pas un extrait : ça grossirait une réponse que tous les plugins reçoivent, et
la note se lit sur la fiche.

### R7 — Les pièces jointes sont des LIENS
`files:` en frontmatter, une liste de chemins logiques résolus comme un lien.
Le fichier vit où il veut, en un seul exemplaire, et n'est jamais copié.

- **Pas d'ajout de fichier en v1.** On se limite à rattacher un fichier
  existant, dans une section dédiée de la fiche.
- La fiche affiche **`files:` et rien d'autre** : elle ignore les fichiers
  posés dans le dossier de la page, sinon une base à plat ferait apparaître le
  même PDF sous toutes les tâches.
- Le 📎 de la liste devient gratuit : l'index porte déjà le frontmatter, donc
  le compte se lit sans requête de plus.

### R8 — Deux niveaux d'affichage, et le second n'existe pas
**Synthèse** = la ligne dans la liste. **Détail** = la fiche d'une tâche, qui
n'existe nulle part aujourd'hui : c'est elle qui porte les champs éditables, la
note rendue par l'éditeur du shell, les sous-tâches et les fichiers liés. Sans
elle, « des notes » et « des pièces jointes » n'ont nulle part où aller.

### R9 — La portée du bloc
Sans attribut : le dossier de la page qui porte le bloc, et ses sous-dossiers.
Avec une référence de page : la même logique depuis le dossier de la page
visée. Chemin logique, donc le multi-store remonte.

Vérifié : c'est gratuit. Un chemin logique ne contient jamais le store, et
`/api/pages/index` rend les chemins logiques de tous les stores ; filtrer sur
un préfixe donne l'union. `ctx.base` vaut déjà le dossier logique de la page.

### R10 — La langue des clés
Une clé de frontmatter suit la langue du contrat de son plugin. La skill de
`todo` est en anglais → `start:`, `assignee:`, `files:`, `me:`. Les *valeurs*
restent le vocabulaire du corpus (`type: tache`, `dom: atelier`).
