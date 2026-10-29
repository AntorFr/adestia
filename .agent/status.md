# Status — Adestia
> MàJ : 2026-10-29

## Version courante

- Dernier tag accessible : **`v0.96.0-adestia-correctifs.7`** (`git describe --tags
  --abbrev=0`; le `.1` était la tranche serveur, le `.2` la tranche chat, le `.3` la tranche shell, le `.4` la tranche pages, le `.5` la tranche plugins, le `.6` la tranche dette, le `.7` la reprise de la tranche chat) de l'epic `adestia-correctifs`, sur la branche d'intégration
  de l'epic ; le dernier tag dans `main` est `v0.95.0` (l'epic `adestia-qualite`).
- Branche de travail : `feature/adestia-correctifs-chat`, sur `origin/epic/adestia-correctifs` : reprise
  de la tranche chat (tag `.2`) après sa vérification : un envoi qui échoue sans phrase lisible du
  serveur (corps vide, illisible, non JSON) lit `t('upload failed')` (`Composer.tsx`, B-16), dit dans
  `CHANGELOG.md` et `ARCHITECTURE.md` (Known defects) ; une connexion coupée avant toute réponse garde
  « request failed (0) », traduit. Rien à coder ici ; les deux premières puces des compléments de Défauts connus (sélecteur de modèle natif, signatures des délégations) sont des défauts gardés, avec leur raison.
  Précédemment : `feature/adestia-correctifs-dette`, sur `origin/epic/adestia-correctifs`
  (tranche dette, AD-26 : plus d'alias d'une ligne dans `packages/drivers` (`no-aliases.test.ts`) ;
  la table des exports gardés pour leurs tests d'`ARCHITECTURE.md` porte une raison par ligne
  (`dette-exports-besoin.test.ts`) ; le banc définit `loadPlaywright` et `launch(seed)` une fois
  (`bench/lib/`, `bench-once.test.mjs`) ; la CI joue `doc-besoin` et `bench-once` ; `DESIGN.md` n'a
  qu'une garde par règle ; `no-misused-promises` et `await-thenable` sont allumées
  (`lint-type-aware.test.ts`). Aucun écran touché. Reste : `no-floating-promises`, voir Défauts
  connus. `.agent/migrate-frame.mjs` n'existe plus : « not reproduced »).
  Précédemment : `feature/adestia-correctifs-plugins`, sur `origin/epic/adestia-correctifs`
  (tranche plugins, AD-24 a-d : l'atelier (réinitialiser la mise en plan) et les voyages (geste
  refusé) parlent dans la feuille propre au plugin, sans `confirm()` ni `alert` — seul changement de
  flux, réponse asynchrone, focus rendu à la carte ; « 1 pièce » et les compteurs des voyages
  s'accordent par langue ; la carte de balade E-28 prend la hauteur de sa boîte ; le lecteur du
  scanner rend le focus au champ du composeur quand son ouvreur a disparu (E-30) ; `--warning`
  ne dit plus que l'Amber du porteur, le retard déduit est tireté ; les émojis de chrome cèdent
  aux icônes de la charte (marques de données, `✦` et `✓` gardés, `emoji.test.js`) ; la date de
  `:::content` suit la langue. Preuves : `bench/plugins-correctifs-proof.md`, `plugins-mots-proof.md`,
  `bench/scenarios/plugins-correctifs.mjs`. Reste : voir Défauts connus).
  Précédemment : `feature/adestia-correctifs-pages`, sur `origin/epic/adestia-correctifs`
  (tranche pages, AD-25 : la trace d'une page racine ne nomme plus de dossier (`folderOf`) et E-8
  mène à Accueil ; le `Popover` reste sous l'en-tête du canevas et les bandeaux et suit son ancre
  (`bench/scenarios/pages-reglages.mjs`) ; un `Diagnostic` porte `code` et `args`, le shell le dit
  par `t()` en `fr`, le `message` anglais du fil est inchangé ; l'index, la planification et la
  liste Planif (`plugins/planif/api.mjs`) lisent une fiche CRLF et une clôture `---` suivie
  d'espaces comme l'éditeur, `stampField` garde la fin de ligne. Preuves : `bench/pages-proof.md`,
  tests `chemin-racine`, `popover-placement`, `page-diagnostics-language`, `frontmatter`,
  `schedule`. Reste, avec sa raison : la page ouverte ne se rafraîchit pas quand l'agent écrit
  (P-5 étape 7) ; les phrases serveur d'E-23 restent en anglais).
  Les tranches pages, shell, chat et serveur de l'epic (tags `.1` à `.4`) sont au
  [CHANGELOG](../CHANGELOG.md), avec leurs restes dans Défauts connus.
  Précédemment : `feature/adestia-qualite-chat`, sur `origin/epic/adestia-qualite`
  (correctifs de recette et de verify : un message envoyé avant que le premier soit parti est retenu ;
  en-tête du rail à moins de 400 px à un seul espacement, sélecteur de modèle d'au moins 72 px ; bulle d'erreur seule à marge symétrique). Banc, tests, serveur, charte,
  plugins, pages et chat sont intégrés à l'epic ; la documentation est relue
  contre le code.
- Déploiement actuel des instances Alfred, Skippy et Nestor : **non attesté ici**. La dernière
  mention commune dans l'ancien état est v0.81.0 le 30/09 ; v0.87.2 est dite
  déployée le 15/10 sans détail par instance déployée. Cela ne prouve pas leur version actuelle.
- Histoire et décisions des chantiers clos : [CHANGELOG.md](../CHANGELOG.md).

## Défauts connus

La liste de référence est dans [ARCHITECTURE.md](../ARCHITECTURE.md), section
« Known defects ». Les défauts catalogues d'options git et de liens symboliques
sont corrigés par `main` et n'y figurent plus.

Compléments encore visibles dans le code :
- Le sélecteur de modèle du chat reste un `<select>` natif (`chat/ModelPicker.tsx`) : une liste
  personnalisée serait un composant neuf (AD-18).
- Une délégation n'affiche pas les cartes de signature (`{ signatures: false }` dans
  `app/Delegations.tsx`) : vue en lecture seule sans gestionnaire de signature (P-13 étape 7).
- `no-floating-promises` reste éteinte : 644 constats (22 en production, 622 dans les tests),
  au-delà du seuil de 15 d'AD-26. `no-misused-promises` et `await-thenable` sont allumées.
- La page ouverte ne se rafraîchit pas quand l'agent écrit (P-5 étape 7).
- Les lignes `champ : message` de `ManifestError` restent en anglais : une table clé par phrases
  de validateur serait nouvelle.
- Phrases serveur d'E-23/E-27 (problèmes de planif, raison d'échec d'une source), mots de données
  du classeur (E-25), types d'éléments de voyage (E-26) et erreur brute d'un geste refusé : en
  anglais ou tels qu'écrits, faute de table clé par phrases (AD-17, AD-24).
- Vu, non réparé : sur la frise d'E-31 en `fr` au bureau, « auj. » touche le repère « nov. »
  (cosmétique, `bench/plugins-correctifs-proof.md`).
- Vu, non réparé (antérieur à la tranche, `plugins/atelier/api.mjs` identique à `main`) : la feuille
  de E-25 envoie `reset: true` et le serveur ne le lit pas ; il ne fusionne que `poses` et `bandes`,
  donc « Abandonner ma mise en plan » ne vide pas `workbook-layout.json` comme P-11 étape 3 le dit.
  Test rouge laissé dans `bench/tests/plugins-ensemble.test.mjs` (« atelier reset », 16 variantes).
- Les formulaires de données de blocs restent à faire : l'édition montre leur
  rendu, puis leurs lignes brutes au clic ; les réglages ne sont pas ces formulaires.

Signalements d'usage hérités, **non reproduits dans cette tâche** : fil « tuyau
Festool » d'Alfred coupé côté moteur ; insertion de `:::table` signalée en 422 au
second enregistrement ; puce `tache` et crayon sous le titre « Note » dans l'éditeur
embarqué ; deux bugs UX du 26/08 (pop-up d'autorisation restant ouverte, fiche
`adestia-evolutions` absente de la navigation). À requalifier par reproduction,
sans les déclarer corrigés. Restent aussi à constater sur appareil : installation
PWA, tuiles de carte `parcours` hors ligne, passkey Tessera en iframe sur iPhone/PWA.

## À moitié construit

- La question de permission ne permet pas de corriger la règle proposée par le
  moteur ; `AskPrompt` ne renvoie que `once`, `always` ou `deny`. Copilot ne porte
  toujours pas le retour interactif (`drivers.ts`).
- La synchronisation git distante du workspace reste absente ; le rafraîchissement
  des catalogues ne synchronise que leurs imports (`instruction-catalogues.ts`).
- Les métriques, coûts et quotas déclarés par les pilotes n'ont pas de vue dédiée ;
  le chat ne consomme que le compteur de contexte (`Chat.tsx`, `contract.ts`).
- Les instructions sont éditables, mais aucun écran ne règle les permissions du
  moteur : ses fichiers de réglages ne sont pas exposés par `instructionPaths()`.
- `maxConcurrentTurns` reste dans le fichier de configuration, absent des champs
  éditables de `SETTING_GROUPS` ; pas de réglage du plafond à l'écran.
- Le chat ne marque pas une perte de contexte moteur après redémarrage ; les homes
  Copilot/Codex sont sous `dataDir`, celui de Claude dépend du `HOME` du déploiement
  (`drivers.ts`).
- Le lanceur `packages/server/bin/adestia.js` n'a pas de commande `adestia init` ;
  il crée `workspace/` et `data/` au démarrage (`created workspace at …`).
- `chat/conversations.ts` expose `deleteConversation`, sans commande à l'écran.
- Le serveur garde le tour sans conversation (question éphémère) ; la coque
  ne propose pas ce mode (`routes/turns.ts`).
- L'éditeur embarqué ne reçoit ni `attach`/`compose` ni l'index `pages` du shell
  (`plugins/PageEditor.tsx`) : pas de dépôt de fichier ni de résolution par cet index.
- Les états de chargement de E-3/E-4/E-9, « Réessayer » de E-8, les toasts et
  l'écran hors ligne restent hors de l'epic (B-1, docs/ecrans.md).
- Mesures du banc en pixels à généraliser ; `journal` : couverture navigateur
  et `api.trail` à compléter selon les signalements de l'ancien état.

## Pièges encore vrais

- **Grammaire absente après installation** : le fork git du parseur est indispensable.
  Vérifier `node_modules/micromark-extension-directive` ; utiliser `npm ci` (CLAUDE.md).
- **Lire les paquets d'une autre branche dans une worktree** : les liens npm peuvent
  viser le checkout primaire ; les résolveurs du dépôt pointent sur les sources locales.
- **Copies d'instructions anciennes au démarrage** : le rechargement des catalogues
  cesse de bloquer le boot après 20 s (`instruction-catalogues-refresh.ts`).
- **Import absent de la source mais toujours présent localement** : le rafraîchissement
  le signale et garde la copie ; retirer le catalogue retire ses imports.
- **Catalogue privé et jeton lisible sur disque** : le fichier d'état garde le jeton
  en clair, mode 0600 (`instruction-catalogues-store.ts`).
- **Source distante inchangée après lecture de ses items** : le clone existant est lu
  sans réseau ; c'est « Rafraîchir » qui le met à jour (`routes/instruction-catalogues.ts`).
- **Permission de fichier Copilot mal mesurée dans `/tmp`** : la CLI autorise ce dossier
  par défaut ; le pilote déclare les racines par `--add-dir`, sans `--disallow-temp-dir`.
- **Fichier bind-monté et `EBUSY` à la sauvegarde** : `settings-file.ts` ne peut pas
  renommer un frère par-dessus ; repli en place pour ce seul cas, refus si lecture seule.
- **Ancien contenu non converti** : `content{view=cards}` et les anciens filtres
  `checklist{view=…}` n'agissent plus ; ne pas relancer une migration close le 20/09.

## Où regarder

- [README.md](../README.md) et [CLAUDE.md](../CLAUDE.md) : lancer, tester, conventions.
- [ARCHITECTURE.md](../ARCHITECTURE.md) : carte, décisions, défauts connus.
- [docs/parcours.md](../docs/parcours.md), [docs/ecrans.md](../docs/ecrans.md),
  [docs/donnees.md](../docs/donnees.md) : usages, écrans et fichiers.
- [docs/charte.md](../docs/charte.md) : jetons, composants et mesures de contraste.
- [DESIGN.md](../DESIGN.md) : raisons et journal des décisions historiques.
- [CHANGELOG.md](../CHANGELOG.md) : versions et tranches de l'epic intégrées.
- [bench/README.md](../bench/README.md) : moteur factice/réel, semis, captures.
