# Status — Adestia
> MàJ : 2026-10-29

## Version courante

- Dernier tag accessible : **`v0.97.0-adestia-ajouts.1`** (`git describe --tags
  --abbrev=0`), tag de l'epic `adestia-ajouts` ; `v0.95.0` est le dernier tag de `main` (epic
  `adestia-qualite`).
- Branche de travail : `feature/adestia-ajouts-mcp`, sur `origin/epic/adestia-ajouts`
  (E-10 : chargement et Réessayer, E-33 : confirmation avant de retirer un serveur MCP, AD-24 et AD-26 ;
  la tranche précédente, chargements des autres écrans, est fusionnée ; recette : aucun scénario de `bench/scenarios/` ne couvre E-10 ni E-33 ; après `npm run build`, ouvrir à la main
  `#/settings/mcp/<nom>` sur `node bench/launch.mjs --engine fake`. `chargements.mjs` couvre les autres écrans). Hérité de l'epic précédent (correctifs de recette et de verify : un message envoyé avant que le premier soit parti est retenu ;
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
- `:::content` affiche `on` tel qu'écrit, sans date au format de la langue
  (`editor/reader/ContentBlock.tsx`).
- L'ambre signifie à la fois attente/retard et évaluation `Amber` d'un projet ;
  le mot distingue, pas la couleur (`plugins/project-management/web/model.js`).
- Les formulaires de données de blocs restent à faire : l'édition montre leur
  rendu, puis leurs lignes brutes au clic ; les réglages ne sont pas ces formulaires.

- La ligne de chargement partagée (`.adestia-loading`, `padding: var(--space-5)`) est
  décalée d'environ 24 px vers la droite du bord du contenu (titre, bannières) sur tous les
  écrans qui la montrent, vue au banc (`bench/scenarios/chargements.mjs`). Elle date de la
  classe partagée (E-2, E-14), pas de la tranche ; non réparée.

Signalements d'usage hérités, **non reproduits dans cette tâche** : fil « tuyau
Festool » d'Alfred coupé côté moteur ; insertion de `:::table` signalée en 422 au
second enregistrement ; puce `tache` et crayon sous le titre « Note » dans l'éditeur
embarqué ; deux bugs UX du 26/08 (pop-up d'autorisation restant ouverte, fiche
`adestia-evolutions` absente de la navigation). À requalifier par reproduction,
sans les déclarer corrigés. Restent aussi à constater sur appareil : installation
PWA, tuiles de carte `parcours` hors ligne, passkey Tessera en iframe sur iPhone/PWA.

## Réglage des tours simultanés (feature `adestia-ajouts-reglage-tours`)

- Fait : le champ « Simultaneous turns » (`maxConcurrentTurns`, 1 à 16, repli 3, `applies: 'restart'`)
  est dans le groupe `turns` de `SETTING_GROUPS`, traduit en `fr`, validé par la route des réglages
  (`settings-file.ts`). L'unité du champ est maintenant traduite par `SettingField`. Un test pose le
  catalogue contre `config.ts` (`packages/server/test/settings-turns.test.ts`).
- Piège : le changement ne s'applique qu'au redémarrage (le limiteur est construit une fois dans
  `buildDesk`, AD-25) ; pas de prise en compte à chaud.
- Reste à la recette : changer le champ à 5, redémarrer, lire `turns.max` dans `/api/instance`.
  Le banc doit exposer la configuration (`--seed config-writable`, sinon E-14 répond 404), et le
  redémarrage n'existe qu'avec le vrai binaire : `--engine fake` n'a pas `POST /api/restart`, et
  `turns.max` y reste 3. Lancer `node packages/server/bin/adestia.js -c <config>` (ou
  `--engine claude` avec `CLAUDE_CODE_OAUTH_TOKEN`) ; captures de E-14 sous les quatre habillages, en `en` et `fr`.

## Confirmation du retrait d'un serveur MCP (feature `adestia-ajouts-mcp`)

- Fait : Remove (E-10) ouvre `ConfirmRemove` (E-33) ; Cancel, ✕, voile et Escape ne suppriment rien ;
  un seul `DELETE` par confirmation ; Remove reste désactivé jusqu'à la réponse. E-10 montre son
  chargement et Réessayer (premier fetch seulement ; un refetch ne revient pas au chargement).
- Piège : le focus initial sur Cancel vient de `data-autofocus` dans `ui/focus.ts` ; aucune autre
  feuille ne le pose, et un effet dans le pied de feuille serait écrasé par celui du scope.
- Reste à la recette : captures de la feuille (téléphone et bureau, quatre habillages, `en`/`fr`) et
  de E-10 ralenti puis en erreur, au banc.

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
- Chargement et « Réessayer » sont construits pour E-3, E-4, E-8, E-9, E-10, E-11 et E-13
  (`adestia-ajouts-chargements`, `adestia-ajouts-mcp`). Restent à faire : E-16 (chat),
  E-25 et E-28 (plugins), le rafraîchissement de E-4 et son bandeau (`page-suivie`),
  le bandeau hors ligne E-32 ; les toasts restent hors de l'epic (docs/ecrans.md).
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
