# Status — Adestia
> MàJ : 2026-11-11

## Version courante

- Version courante : **`v0.98.0-adestia-pages.1`** (préversion de l'epic `adestia-pages` : doc seule, l'étape vitest rouge de 28e089c9 rapportée à ses trois tests instables, `rouge-adestia-pages-2`) ; avant elle **`v0.97.11`** (correctif du test de sauvegarde refusée des pages, autre locale, `rouge-adestia-7`) ; avant elle **`v0.97.10`** (correctif du test P-2 des onglets du rail et de celui de l'icône de liste, `rouge-adestia-8`) ; avant elle **`v0.97.9`** (correctif du test B-19 du bandeau « le serveur ne répond pas », instable sous charge, `rouge-adestia-5`) ; avant elle **`v0.97.8`** (correctif de cinq tests instables sous charge, `rouge-adestia-9`) ; avant elle **`v0.97.7`** (correctif du test de sauvegarde refusée des pages, `rouge-adestia-6`) ; avant elle **`v0.97.6`** (entrée du CHANGELOG ; la preuve de test devient l'attestation de la chaîne, `feature/adestia-preuve-tests` : le tag est posé à la fusion dans `main`) ; avant elle **`v0.97.5`** (correctif du balayage skippy et du test CRLF des pages, `rouge-adestia-4`) ; avant elle **`v0.97.4`** (correctif de deux tests de pages, `rouge-adestia-3`) ; avant lui **`v0.97.3`** (correctif de l'authentification Copilot, fusion de `feature/adestia-copilot-auth`) ; avant lui : **`v0.97.2`** (correctif des sondes eslint du bloc R-8, posé sur `main` par la fusion de `rouge-adestia-2`), **`v0.97.1`** (correctif de la garde B-5, fusion de `rouge-adestia-1`), puis **`v0.97.0`** (`git describe --tags --abbrev=0`, posé sur `main` par la fusion de l'epic
  `adestia-ajouts` ; ses préversions `v0.97.0-adestia-ajouts.1` à `.12` sont posées sur sa branche) ; le tag précédent
  dans `main` était `v0.96.1` (correctif de la garde `besoin-pages-statique`, fusion de `adestia-correctif-garde-changelog`), avant lui `v0.96.0` (l'epic `adestia-correctifs`).
- Branche de travail : `feature/rouge-adestia-pages-2` (doc seule : l'étape vitest rouge de `epic/adestia-pages` est rapportée à ses trois tests instables, tous pris par `rouge-adestia-pages-1`, voir la section ci-dessous ; aucun code ni test changé) ; avant elle `feature/rouge-adestia-7` (test seul, même test que `rouge-adestia-6` : Entrée n'est pressée sur le menu « / » qu'une fois aucun enregistrement en vol (la réponse d'un autosave rebasait l'éditeur sous le bloc choisi), puis le test attend que le bloc callout soit entré dans l'éditeur et, tant qu'il n'y est pas, vide la ligne et rouvre le menu (3 essais : un autosave qui répond entre les vérifications et Entrée ferme le menu), avant l'attente du PUT du `:::callout` de `rouge-adestia-6` ; cinq dépassements distincts : menu « / » jamais ouvert, jamais filtré, autosave jamais répondu, callout jamais entré, enregistrement jamais parti ; code du produit inchangé) ; avant elle `feature/rouge-adestia-8` (test seul : le test P-2 « opens conversations as tabs on a desk, closes one with the x icon without archiving it, and reorders by drag » de `packages/web/test/besoin-chat-browser.test.ts`, instable sous la charge de la suite complète, attend des états par `expect.poll` (deux onglets, glisser rejoué tant que l'ordre n'a pas suivi, onglet fermé) au lieu de `waitForTimeout(500)` ; assertions et code du produit inchangés ; le rejeu en trois passes demande Playwright, absent de l'atelier d'intégration) ; avant elle `feature/rouge-adestia-9` (tests seuls : cinq tests instables sous la charge du pod — rail du chat P-2, E-10 MCP, E-19 bandeau, page introuvable, table R-6 — ont un délai explicite par test ou par `describe` au lieu du délai vitest de 5 s ; le test du rail attend le décompte des entrées (`expect.poll`) au lieu de `waitForTimeout(800)` ; aucun `testTimeout` global, aucune assertion retirée, code du produit inchangé) ; avant elle `feature/rouge-adestia-5` (test seul : le test B-19 « tous les appels /api/ échouent, la sonde /api/health aussi » de `packages/web/test/besoin-hors-ligne-browser.test.ts`, instable sous charge, a trois budgets d'échec de 30 s (bandeau visible, deux sondes comptées, bandeau parti) et un délai de test de 150 s, au lieu de fenêtres de 8 à 10 s ; le test relance un appel `/api/` échoué tant que le bandeau est absent et ne compte les sondes que dans une même période d'affichage ; mêmes preuves, `serverReach.ts` et ses 3 s / 5 s inchangés ; version `v0.97.9`. **Piège** : un succès tardif d'un appel antérieur à la panne arrête la boucle de sonde de `serverReach.ts` et efface un bandeau naissant, probablement une vraie course du produit, rapportée et non corrigée) ; avant elle `feature/rouge-adestia-6` (test seul : `sauvegarde_refusee_dit_le_diagnostic_dans_la_langue_et_garde_lediteur` de `packages/web/test/besoin-pages-ensemble-browser.test.ts`, instable sous la charge de la suite complète, arme avant la frappe l'attente du PUT qui porte le `:::callout` vide (un autosave antérieur répond « Saved » et n'est pas le refus), puis lit le statut en 15 s ; code du produit inchangé) ; avant elle `feature/adestia-preuve-tests` (R15 : `.sdlc.yaml` déclare `tests:` (`scripts/suite-attestee.sh`, rapport JUnit `resultats.xml`, une entrée par étape et par test) ; `ci.yml` supprimé, ses quatre gardes relisent le script ; `docker-publish.yml` ne construit que sur tag `v*` ou à la main, derrière un job `attestation`, sans tag `:main` ; AD-preuve-1 à 4 dans ARCHITECTURE.md. **Reste** : le ruleset `tests-complets` sur `main` (tâche `adestia-preuve-tests-ruleset`, après l'attestation de la tête ; un 403 du jeton de la chaîne est un constat pour Monsieur). Un commit poussé après l'attestation la rend caduque : `attester --cible main --publier` de nouveau) ; avant elle `feature/rouge-adestia-4` (tests seuls : le plafond du balayage complet de `packages/server/test/bench-ensemble.test.ts` passe de 420 s à 1 200 s, quatre fois la mesure sur un cœur (`taskset -c 0`, 280-295 s) ; le test CRLF de `besoin-pages-ensemble-browser.test.ts` attend en plus le bouton « Done » de l'éditeur monté et reclique l'engrenage tant que le popover manque, sur le signal de `rouge-adestia-3` (premier champ égal au titre) ; code du produit inchangé) ; avant elle `feature/rouge-adestia-3` (test seul : les tests `editeur_montre_les_champs_dune_page_crlf_comme_ceux_de_sa_jumelle_lf` et `sauvegarde_refusee_dit_le_diagnostic_dans_la_langue_et_garde_lediteur` de `packages/web/test/besoin-pages-ensemble-browser.test.ts`, instables sous la charge de la suite complète, attendent maintenant le signal de leur état (index chargé, éditeur monté avec `Corps.`, premier champ du popover égal au titre) et des marges de 30 à 60 s ; assertions et code du produit inchangés) ; avant elle `feature/rouge-adestia-2` (test seul : les deux sondes eslint du bloc R-8 de `packages/server/test/qualite-serveur-besoin.test.ts` ont 60 s de délai de test et un plafond `spawnSync` de 50 s, car le délai vitest de 5 s les coupait sous la charge de `npm test` ; le code du lint n'a pas changé) ; avant elle `feature/rouge-adestia-1` (test seul : la garde B-5 de `bench/tests/doc-besoin.test.mjs` ne liste que les tags fusionnés dans HEAD, `--merged HEAD`, pour que les tags d'une epic non fusionnée ne rougissent pas `main`) ; précédemment `epic/adestia-ajouts`, entrée dans `main` : dernière tranche livrée, `feature/adestia-ajouts-chat`
  (chargement et Réessayer du chat, E-16 ; marque de contexte perdu de Claude, AD-28 ; recette : `node bench/scenarios/chat-ajouts.mjs`).
  Livré avant elle sur l'epic : chargement et Réessayer des plugins Atelier et Parcours, E-25 et E-28, AD-29 ; le bandeau hors ligne E-32, AD-27 (`node bench/scenarios/hors-ligne.mjs`) ; la page ouverte suit l'agent, AD-21 (`node bench/scenarios/page-suivie.mjs`) ;
  chargement et Réessayer des écrans, AD-29 (`node bench/scenarios/chargements.mjs`) ; E-10 (chargement, Réessayer) et la confirmation E-33 avant de retirer un serveur MCP, AD-31 (aucun scénario de `bench/scenarios/`
  ne les couvre ; après `npm run build`, ouvrir à la main `#/settings/mcp/<nom>` sur `node bench/launch.mjs --engine fake`).
  Précédemment : les tranches des epics `adestia-correctifs` (`v0.96.0`) et `adestia-qualite` (`v0.95.0`) sont au
  [CHANGELOG](../CHANGELOG.md), avec leurs restes dans Défauts connus ci-dessous.
- Déploiement actuel des instances Alfred, Skippy et Nestor : **non attesté ici**. La dernière
  mention commune dans l'ancien état est v0.81.0 le 30/09 ; v0.87.2 est dite
  déployée le 15/10 sans détail par instance déployée. Cela ne prouve pas leur version actuelle.
- Histoire et décisions des chantiers clos : [CHANGELOG.md](../CHANGELOG.md).

## Étape vitest rouge de `epic/adestia-pages` à 28e089c9 (`rouge-adestia-pages-2`)

Source : `resultats.xml` du pod `sdlc-adestia-pages-deplacer-mouvement-review-1` (écrit à 17:36:53, fin de la mesure à 17:36:55) et
liste des instables de la mesure `28e089c9`. L'étape `vitest` y est en échec (« step vitest failed ») ; le rapport ne contient
qu'un seul test en échec, les deux autres viennent de la mesure. Tous sont pris ailleurs, aucun code ni test n'est changé ici :

| Test | Classe | Sort |
|---|---|---|
| `besoin-hors-ligne-bords.test.ts` > B-19 … un 502 sur un appel /api/ alors que la sonde échoue : le bandeau apparaît ; la sonde repasse : il part seul | instable sous charge (`expected +0 to be 1`) | `rouge-adestia-pages-1-bandeau-502` |
| `besoin-pages-ensemble-browser.test.ts` > … alfred / fr > `sauvegarde_refusee_dit_le_diagnostic_dans_la_langue_et_garde_lediteur` | instable sous charge | `rouge-adestia-pages-1-refus-sauvegarde` |
| même fichier > … dobby / fr > même test | instable sous charge | `rouge-adestia-pages-1-refus-sauvegarde` |

Aucune cause hors tests (config vitest, mémoire, délai) n'apparaît dans le rapport. La mesure de `810fa3cc` (tête actuelle de l'epic) ne
montre aucun rouge ni instable. Les dix rejeux de `npx vitest run` n'ont pas été joués : les rapports ne sont pas perdus et un
passage dure ~25 min. L'étape se juge au rejeu de la suite de l'epic une fois `rouge-adestia-pages-1` livrée.

## Défauts connus

La liste de référence est dans [ARCHITECTURE.md](../ARCHITECTURE.md), section
« Known defects ». Les défauts catalogues d'options git et de liens symboliques
sont corrigés par `main` et n'y figurent plus.

Compléments encore visibles dans le code :
- Copilot : le refus d'authentification non reconnu cite la fin de la sortie d'erreur de la CLI (400 caractères, jetons `gh*_` masqués) ; l'armement lit `authTokens` (CLI 1.0.98) avant `copilotTokens`. Corrigé en `v0.97.3`, plus un défaut ; `authTokens` est le format de la CLI 1.0.98, les chaînes de `auth.ts` restent épinglées à la 1.0.80.
- Le sélecteur de modèle du chat reste un `<select>` natif (`chat/ModelPicker.tsx`) : une liste
  personnalisée serait un composant neuf (AD-18).
- Une délégation n'affiche pas les cartes de signature (`{ signatures: false }` dans
  `app/Delegations.tsx`) : vue en lecture seule sans gestionnaire de signature (P-13 étape 7).
- `no-floating-promises` reste éteinte : 644 constats (22 en production, 622 dans les tests),
  au-delà du seuil de 15 d'AD-26. `no-misused-promises` et `await-thenable` sont allumées.
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

## Ce que l'epic `adestia-ajouts` laisse à savoir

- Réglage des tours (`maxConcurrentTurns`, 1 à 16, repli 3) : il ne s'applique qu'au redémarrage, le limiteur est construit
  une fois dans `buildDesk` (AD-30). `--engine fake` n'a pas `POST /api/restart` : lire `turns.max` demande le vrai binaire.
- Page ouverte : le bandeau compare la révision de `useAutosave`, pas `page.revision` ; après une panne du serveur rien
  n'est rattrapé avant le lot suivant (AD-27 rejette le sondage) ; seul le Reload de l'utilisateur remplace la saisie (AD-21).
- Retrait d'un serveur MCP : le focus initial sur Cancel vient de `data-autofocus` dans `ui/focus.ts` (AD-31) ; un effet
  dans le pied de feuille serait écrasé par celui du scope.
- Bandeau hors ligne : la sonde appelle le `fetch` détaché de son ref (sinon « Illegal invocation », lu comme une sonde
  échouée), ce que seuls les tests en navigateur voient (`besoin-hors-ligne-browser.test.ts`, instable une fois sous charge).
- Le bandeau hors ligne colle sous l'en-tête du canevas par `top: var(--canvas-header-h)`, la variable que l'en-tête prend aussi pour `min-height` : un 56px en dur laissait une fente de 2 à 4 px (`offline-banner-sticky.test.ts`).
- Chat : la relance sans session n'a lieu que sur le refus exact de Claude, avant tout texte (AD-28) ; seul Claude porte
  la marque. `claude-lost-session.real.test.ts` est sauté sans `CLAUDE_CODE_OAUTH_TOKEN` : un `npm test` vert sans jeton
  ne le prouve pas. Le banc de chaque tranche : `node bench/scenarios/<chargements|page-suivie|hors-ligne|chat-ajouts>.mjs`.


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
- La marque de contexte perdu ne vaut que pour Claude (Copilot et Codex ne peuvent pas perdre leur session : homes sous `dataDir`) ; le home de
  Claude dépend toujours du `HOME` du déploiement (`drivers.ts`), le déplacer sous `dataDir` est hors tranche.
- Le lanceur `packages/server/bin/adestia.js` n'a pas de commande `adestia init` ;
  il crée `workspace/` et `data/` au démarrage (`created workspace at …`).
- `chat/conversations.ts` expose `deleteConversation`, sans commande à l'écran.
- Le serveur garde le tour sans conversation (question éphémère) ; la coque
  ne propose pas ce mode (`routes/turns.ts`).
- L'éditeur embarqué ne reçoit ni `attach`/`compose` ni l'index `pages` du shell
  (`plugins/PageEditor.tsx`) : pas de dépôt de fichier ni de résolution par cet index.
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
