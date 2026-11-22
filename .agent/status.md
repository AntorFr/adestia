# Status — Adestia
> MàJ : 2026-11-21

## Version courante
Version courante : **`v0.99.0-adestia-decouverte.1`**, préversion de l'epic `adestia-decouverte` (branche `epic/adestia-decouverte`) ; dernier tag stable de `main` : `v0.98.12`. L'histoire des versions et ses raisons sont dans [CHANGELOG.md](../CHANGELOG.md), pas ici.

- Branche de travail : `feature/rouge-adestia-decouverte-1` (correctif de doc ; dernière feature de l'epic livrée : `feature/adestia-decouverte-creer-dossier`, E-38 : le + et New folder ; `POST /api/folders`, champ `folders` de l'index).

Déploiement des instances Alfred, Skippy et Nestor : **non attesté ici** (dernière mention commune v0.81.0 le 30/09 ; v0.87.2 dite déployée le 15/10 sans détail par instance).

## Reste à faire, par chantier livré
- `adestia-decouverte-creer-dossier` (E-38, AD-37 côté cœur, AD-38) : **Reste** : créations des plugins, `template`, modèles, champ Folder d'E-36 (tranche 2) ; la ligne d'état vide pointe encore vers `adestia.config.yaml` (la page Plugins E-37 existe, la ligne ne la vise pas encore). **Piège** : le type de création admet `template`, seul `{folder: true}` est joué.
- `adestia-plugins-reglages` (E-37, AD-plugins-1 à 3) : **Piège** : `loaded` (démarrage) ≠ `wanted` (fichier) tant qu'on n'a pas redémarré ; les écritures de la page sont chaînées pour porter chacune la révision de la précédente ; pas de rechargement à chaud. `PUT /api/plugins/:id` reste sans rôle administrateur (risque accepté par le propriétaire, inscrit dans AD-plugins-1).
- `adestia-ecrans-sans-local` et `adestia-niveau-fiche` : **Pièges** : un script de sélection ou de jeu nouveau entre dans `outillage:` ; un fichier de test d'écran ajouté, déplacé ou renommé entre dans `scripts/ecrans.json` (`node scripts/niveaux.mjs --verifier`, aucune suite ne le joue) ; les clés `local:`/`ecrans:`/`fiche:`/`rejouer:`/`outillage:` ne se lisent que sur `main`.
- `adestia-ecrans-liste` : **Reste** : `--verifier` sort 1 sur `main` (`besoin-coller-tableau`, `besoin-copie-bords`, `besoin-copie` en `-browser.test.ts` absents de `scripts/ecrans.json`). **Pièges** : un test d'écran absent de la carte est joué à tout niveau ; seuls les spécificateurs d'import littéraux sont suivis.
- `adestia-tests-hors-ecran` : **Reste** : l'allègement des tests d'écran eux-mêmes (colonne « À l'écran » `gardé` partout). **Pièges** : un nouveau fichier qui nomme `chromium|playwright` entre dans une grappe de `docs/tests-ecran/README.md`, sinon `tests-ecran-garde` rougit ; un test retiré garde sa ligne d'inventaire.
- `adestia-acces-refuse` : **Reste côté déploiement, hors dépôt** : le client OIDC doit lister l'URI de retour de déconnexion (`auth.oidc.postLogoutRedirectUri`). **Piège** : le cookie `adestia_refused` porte l'id_token ; au-delà de 4000 caractères (`COOKIE_LIMIT`) l'indice est abandonné et la déconnexion retombe sur le repli.
- `adestia-mcp-cle-par-serveur` : **Piège** : `McpTokens` ne distingue les serveurs que par `tokenUrl|clientId`, d'où un minteur `McpSignIn` par entrée de `mcp-signin.json`.
- `adestia-niveau-local` : **Piège** : `local:` ne remplace jamais l'attestation.
- `adestia-build-limite` : **Reste** : le build du tag `v0.98.3` vert, constaté à la livraison. **Piège** : un nouveau job de `docker-publish.yml` porte sa limite (`timeout-minutes: 120`).
- `adestia-bloc-a-copier` : **Reste** : tenir la convention `copy` sur un moteur réel (essai de bout en bout, à la vérification) ; sinon réécrire la skill `skills/copy-block/SKILL.md`, pas le marqueur. **Pièges** : `Prose` ne reçoit `t` que de `Bubble`, `Thread` et `LiveProse` ; la cible 44 px du téléphone est une règle CSS regardée au banc, sans test.
- `adestia-version-hors-image` (AD-version-1) : **Pièges** : une branche affiche la dernière version de son propre CHANGELOG ; une image construite sans `ADESTIA_VERSION` ne copie pas le CHANGELOG et n'affiche rien.
- `adestia-coller-tableau` : pas de formules ni de couleurs collées.
- `adestia-pages` tranche 4 (page « Project status ») : **Pièges** : le modèle ne porte aucune date écrite d'avance ; la clôture d'un conteneur est plus longue que celle de ses enfants (`:::::columns` / `::::col`) ; un jalon non fait et passé est « en retard », jamais « prochain » ; `writableFolders` n'est qu'un indice, l'écriture reste le verdict ; la puce `-` vide du modèle n'est jamais gardée par le formulaire. **Reste** : charge par personne (bloc D), page vierge dans E-36, variante danger de la jauge.
- `adestia-pages` tranche 3 (sections et colonnes) : **Pièges** : la carte de `:::row` s'appelle « Line break » ; le code dit `range` là où l'AD disait `bounds` ; une insertion écrit des paragraphes vides, normalisés à la relecture ; `adestia-section`/`adestia-fold` existent déjà, d'où `adestia-block-section` ; ni `fr`, ni sombre, ni téléphone regardés pour l'édition. Corpus de B-31 : `packages/content/test/fixtures/corpus/` ; `CORPUS_WRITE=1` ne régénère que si une page doit changer, et le commit le dit.
- `adestia-decouverte-renommer` (AD-39, B-35, E-3/E-37) : `POST /api/folders/rename` `{path,name}` → 200 `{path, unrewritten}` / 404 / 409 / 403 / 400 / 422 (`routes/pages.ts`, `folder-links.ts`) ; bouton Rename (`app/RenameFolder.tsx`) et notice « n pages pointent encore… ». **Reste** : supprimer ou déplacer un dossier, alias de l'ancien nom (hors tranche). **Piège** : un dossier d'app, configuré ou multi-store répond 422 ; le droit exige l'écriture dans le dossier ET son parent ; un store en lecture seule garde ses liens et compte dans `unrewritten`.

## Défauts connus

La liste de référence est dans [ARCHITECTURE.md](../ARCHITECTURE.md), section
« Known defects ». Les défauts catalogues d'options git et de liens symboliques sont corrigés par `main` et n'y figurent plus.

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
- `maxConcurrentTurns` (1 à 16, repli 3) ne s'applique qu'au redémarrage (AD-30) ; `--engine fake` n'a pas `POST /api/restart`.
- Page ouverte : le bandeau compare la révision de `useAutosave`, pas `page.revision` ; seul le Reload de l'utilisateur remplace la saisie (AD-21, AD-27).
- Retrait d'un serveur MCP : le focus initial sur Cancel vient de `data-autofocus` dans `ui/focus.ts` (AD-31).
- Bandeau hors ligne : la sonde appelle le `fetch` détaché de son ref (sinon « Illegal invocation ») ; il colle sous l'en-tête par `top: var(--canvas-header-h)`. Un succès tardif d'un appel antérieur arrête la boucle de `serverReach.ts` : sa règle, non une course.
- Chat : la relance sans session n'a lieu que sur le refus exact de Claude, avant tout texte (AD-28) ; `claude-lost-session.real.test.ts` est sauté sans `CLAUDE_CODE_OAUTH_TOKEN`.

## À moitié construit
- La question de permission ne corrige pas la règle proposée par le moteur (`AskPrompt` : `once`, `always` ou `deny`) ; Copilot ne porte pas le retour interactif (`drivers.ts`).
- Galerie et déplacement de blocs (`editor/moveBlock.ts`, `BlockGallery.tsx`) : `moveBlock` reçoit `toParent` mais n'est appelé qu'avec la racine. Recette : `node bench/launch.mjs --engine fake --seed pages`, puis `BENCH_URL=<url> node bench/scenarios/pages-matrix.mjs bench/scenarios/galerie.mjs`. **Piège** : sans sélection choisie, la galerie insère en fin de page.
- La synchronisation git distante du workspace est absente ; le rafraîchissement des catalogues ne synchronise que leurs imports.
- Les métriques, coûts et quotas des pilotes n'ont pas de vue ; aucun écran ne règle les permissions du moteur (`instructionPaths()`).
- La marque de contexte perdu ne vaut que pour Claude ; son home dépend du `HOME` du déploiement (`drivers.ts`).
- Pas de commande `adestia init` (`packages/server/bin/adestia.js` crée `workspace/` et `data/`) ; `deleteConversation` sans commande à l'écran ; le tour sans conversation n'est pas proposé par la coque.
- L'éditeur embarqué ne reçoit ni `attach`/`compose` ni l'index `pages` (`plugins/PageEditor.tsx`).

## Pièges encore vrais
- **Popover : les frontières se relisent, ne se figent pas.** `Popover.tsx` interroge `.adestia-canvas__header`, `.adestia-console-host`, `.adestia-problems` et `.adestia-editor__readonly` à chaque placement ; un nouveau bandeau du canvas doit rester dans cette liste de sélecteurs pour être évité (le `MutationObserver` ne fait que déclencher le placement).
- **Balayage E-26 (voyages) sous charge** : la preuve `.voyages-page .vhub-card` attend `APPEAR_MS` = 60 s (`bench/lib/capture.mjs`), et un écran dont l'attente expire est repris une fois dans un contexte neuf ; au second échec, l'erreur nomme la preuve manquante. Si le test rougit encore, ce n'est plus la charge mais un écran qui ne rend pas (`sweep-reprise.test.ts`, plafond de `bench-ensemble.test.ts` à 1 800 s).
- **Attentes de test : une seule patience.** `ADESTIA_PATIENCE` (1 par défaut ; 4 sur l'étape vitest de `scripts/suite-attestee.sh`) met à l'échelle les délais des tests Playwright et des tests jsdom qui importent `packages/web/test/patience.ts`. Un nouveau test navigateur passe ses délais par `patience()` ; un `waitForTimeout` porte `// pause fixe : <raison>`. `charte-browser.ts` attend la coque par `awaitShell()` (60 s fixes, voulu). Les tests Playwright ne se jouent pas dans un pod sans Playwright : la preuve est l'attestation de la chaîne. **Piège** : la somme des attentes d'un test doit rester sous son délai (`--testTimeout` 30 s), sinon vitest coupe avant le message.
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
- **Garde de version** : tag stable sans entrée, titre non cité par `status.md` ou en avance de deux, restent refusés ; une préversion `vX.Y.Z-serie.N` sans entrée ne l'est plus (l'entrée courait contre la fusion du tag).

## Où regarder
- [README.md](../README.md) et [CLAUDE.md](../CLAUDE.md) : lancer, tester, conventions.
- [ARCHITECTURE.md](../ARCHITECTURE.md) : carte, décisions, défauts connus.
- [docs/parcours.md](../docs/parcours.md), [docs/ecrans.md](../docs/ecrans.md),
  [docs/donnees.md](../docs/donnees.md) : usages, écrans et fichiers.
- [docs/charte.md](../docs/charte.md) : jetons, composants et mesures de contraste.
- [DESIGN.md](../DESIGN.md) : raisons et journal des décisions historiques.
- [CHANGELOG.md](../CHANGELOG.md) : versions et tranches de l'epic intégrées.
- [bench/README.md](../bench/README.md) : moteur factice/réel, semis, captures.
