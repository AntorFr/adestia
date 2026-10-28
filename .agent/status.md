# Status — Adestia
> MàJ : 2026-10-28

## Version courante

- Dernier tag accessible : **`v0.96.0-adestia-correctifs.2`** (`git describe --tags
  --abbrev=0`; le `.1` était la tranche serveur, le `.2` la tranche chat) de l'epic `adestia-correctifs`, sur la branche d'intégration
  de l'epic ; le dernier tag dans `main` est `v0.95.0` (l'epic `adestia-qualite`).
- Branche de travail : `feature/adestia-correctifs-pages`, sur `origin/epic/adestia-correctifs`
  (tranche pages, AD-25 : la trace d'une page racine ne nomme plus de dossier (`folderOf`) et E-8
  mène à Accueil ; le `Popover` reste sous l'en-tête du canevas et les bandeaux et suit son ancre
  (`bench/scenarios/pages-reglages.mjs`) ; un `Diagnostic` porte `code` et `args`, le shell le dit
  par `t()` en `fr`, le `message` anglais du fil est inchangé ; l'index, la planification et la
  liste Planif (`plugins/planif/api.mjs`) lisent une fiche CRLF et une clôture `---` suivie
  d'espaces comme l'éditeur, `stampField` garde la fin de ligne. Preuves : `bench/pages-proof.md`,
  tests `chemin-racine`, `popover-placement`, `page-diagnostics-language`, `frontmatter`,
  `schedule`. Reste, avec sa raison : la page ouverte ne se rafraîchit pas quand l'agent écrit
  (P-5 étape 7) ; les phrases serveur d'E-23 restent en anglais).
  Précédemment : `feature/adestia-correctifs-shell`, sur `origin/epic/adestia-correctifs`
  (tranche shell, AD-24 : la flèche d'envoi de Nestor est un SVG ; la tuile MCP compte les serveurs
  listés par E-10, la santé ne dit que combien demandent attention ; le bandeau de Skippy tient sur
  une ligne à 360 px ; l'interrupteur d'E-14 reste sur la ligne de son titre ; l'en-tête
  « Invalid plugin/skin manifest » suit la langue ; `refresh()` de la popin montre l'erreur levée ;
  une seule règle `.adestia-icon--spin`. Jeton : not reproduced, déjà `autoComplete="off"`. E-20 :
  relu, rien à corriger. Preuves : `bench/shell-proof.md`, `test/shell-textes.test.tsx`,
  `test/skin-nestor-invite.test.ts`. Reste, avec sa raison : les lignes `champ : message` de
  `ManifestError` restent en anglais, une table clé par phrases de validateur serait nouvelle).
  Précédemment : `feature/adestia-correctifs-chat`, sur `origin/epic/adestia-correctifs`
  (tranche chat d'`adestia-correctifs`, AD-23 : un tour refusé en 429 est dit par `t()` en `en`/`fr`
  avec le plafond, et sa ligne survit à la relecture jusqu'au prochain envoi ou à une autre
  conversation ; le message envoyé dessine l'icône `paperclip` et les noms, plus d'émoji texte ;
  `upload failed` et les trois classes CSS sont gardés par `chat-repaired-defects.test.ts` ;
  le pli du composeur et les signatures de délégation sont tenus par des tests ; la course du
  chat est au CHANGELOG. Reste, avec sa raison : le sélecteur de modèle natif et l'absence de
  cartes de signature en délégation).
  Précédemment : `feature/adestia-correctifs-serveur`, sur `origin/epic/adestia-correctifs`
  (tranche serveur d'`adestia-correctifs`, AD-22 : `start()` refuse un pilote dont le descripteur
  ne tient pas son contrat (`Driver "<id>" is not conformant:` + un écart par ligne) ; l'enregistrement
  de la configuration garde le mode du fichier (0600) ; le commentaire de `user-tokens.ts` dit que
  le fichier porte aussi le jeton d'accès et son échéance ; les anciens fichiers ne réexportent plus
  les `register*` de `routes/`, gardé par `reexports-retires.test.ts`. Plus aucun défaut serveur connu).
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
- Le focus perdu sur téléphone quand le lecteur d'E-30 se ferme n'est pas réparé (tranche plugins) ;
  le pli du composeur, lui, rend bien le focus au champ.
- `:::content` affiche `on` tel qu'écrit, sans date au format de la langue
  (`editor/reader/ContentBlock.tsx`).
- L'ambre signifie à la fois attente/retard et évaluation `Amber` d'un projet ;
  le mot distingue, pas la couleur (`plugins/project-management/web/model.js`).
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
