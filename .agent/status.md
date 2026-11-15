# Status — Adestia
> MàJ : 2026-11-15
## Version courante
- Feature `adestia-acces-refuse` (livrée en `v0.97.14`) : un compte OIDC hors des groupes autorisés voit la `RefusedGate` (E-1) qui le nomme, avec **Se déconnecter** ; `POST /auth/logout` ferme aussi la session du fournisseur (`end_session_endpoint`, sinon `/auth/login?switch=1` → `prompt=login`). AD-acces-refuse-1 et -2 dans ARCHITECTURE.md. Recette en bouchon : `node bench/scenarios/acces-refuse.mjs` (`--no-end-session` joue le repli). **Reste côté déploiement, hors dépôt** : le client OIDC du fournisseur doit lister l'URI de retour de déconnexion (`auth.oidc.postLogoutRedirectUri`). **Piège** : le cookie `adestia_refused` porte l'id_token ; au-delà de 4000 caractères (`COOKIE_LIMIT`) l'indice est abandonné et la déconnexion retombe sur le repli.
- Feature `adestia-niveau-local` (livrée en `v0.97.16`) : `.sdlc.yaml` déclare `tests.local` (`scripts/suite-locale.sh`, ~10 min) et `tests.rejouer` (`scripts/rejouer.sh {tests}`) sous la suite attestée inchangée (~35 min) ; AD-preuve-5 dans ARCHITECTURE.md. **Piège** : `local:` ne se lit que sur `main`, il ne prend effet qu'après la fusion ; il ne remplace jamais l'attestation.
- Version courante : **`v0.98.0-adestia-pages.25`** (une bulle « en attente » du chat n'est plus laissée sans suiveur quand le tour se règle à l'instant de l'envoi, et le test de recette des formulaires de données suit `ADESTIA_PATIENCE` et attend la ligne ajoutée, `rouge-adestia-pages-24`) ; avant elle **`v0.98.0-adestia-pages.22`** (test des réglages de bloc en haut de page qui attend le popover, l'en-tête et les bandeaux posés, et messages d'échec du balayage B-3, `rouge-adestia-pages-17`) ; avant elle **`v0.98.0-adestia-pages.21`** (le panneau de réglages d'un bloc relit ses frontières à chaque placement et suit les bandeaux qui arrivent ou partent après son ouverture, `rouge-adestia-pages-22`) ; avant elle **`v0.98.0-adestia-pages.20`** (test de la ligne d'attente d'E-14 qui tient la requête des réglages sur une barrière levée par le test au lieu de 2,5 s, `rouge-adestia-pages-23`) ; avant elle **`v0.98.0-adestia-pages.19`** (relevé du chat qui attend la fin de chaque tour et dit l'attente qui expire, test skin dobby, `rouge-adestia-pages-20`) ; avant elle **`v0.98.0-adestia-pages.18`** (balayage des écrans qui attend l'apparition de chaque preuve 60 s et reprend un écran lent une fois, `rouge-adestia-pages-16`) ; avant elle **`v0.98.0-adestia-pages.17`** (deux tests du navigateur qui attendent leur état posé : suppression d'un serveur MCP et cadences des notes CRLF, `rouge-adestia-pages-15`) ; avant elle **`v0.98.0-adestia-pages.16`** (garde de version qui n'exige plus d'entrée CHANGELOG par préversion de série, `rouge-adestia-pages-12`) ; avant elle **`v0.98.0-adestia-pages.15`** (test des réglages de bloc en haut de page qui attend que le popover soit posé au lieu de 300 ms, `rouge-adestia-pages-14`) ; avant elle **`v0.98.0-adestia-pages.14`** (balayage des écrans qui attend la preuve d'un écran en proportion du démarrage du shell, et test CRLF des pages qui attend un signal, `rouge-adestia-pages-9`) ; avant elle **`v0.98.0-adestia-pages.13`** (test de l'échéance égale au début des formulaires de données qui attend des signaux, `rouge-adestia-pages-13`) ; avant elle **`v0.98.0-adestia-pages.12`** (test du redémarrage de `besoin-tours` qui attend l'instance relancée jusqu'à une échéance de 90 s, `rouge-adestia-pages-11`) ; avant elle **`v0.98.0-adestia-pages.11`** (test du chat `skin dobby` : les attentes de rendu de la matrice passent par un plafond de 45 s, `rouge-adestia-pages-10`) ; avant elle **`v0.98.0-adestia-pages.10`** (test du rechargement MCP après Save qui attend la zone de saisie remplie puis Save actif, `rouge-adestia-pages-8`) ; avant elle **`v0.98.0-adestia-pages.9`** (test de l'écran « missing » à 1440 px qui attend l'éditeur importé, `rouge-adestia-pages-7`) ; avant elle **`v0.98.0-adestia-pages.8`** (trois tests instables du navigateur qui attendent des signaux, `rouge-adestia-pages-6`) ; avant elle **`v0.98.0-adestia-pages.7`** (rouges d'ailleurs de l'epic rendus verts : entrée du CHANGELOG du tag `.6`, doc seule, `rouge-adestia-pages-5`) ; avant elle **`v0.98.0-adestia-pages.6`** (blocs du cœur redessinés, réglages groupés avec variantes en images, formulaire de saisie Edit data / Raw, fusion de `adestia-pages-blocs-formulaires`) ; avant elle **`v0.98.0-adestia-pages.5`** (rouges d'ailleurs de l'epic rendus verts, doc seule, `rouge-adestia-pages-3`) ; avant elle **`v0.98.0-adestia-pages.4`** (deux tests à délai tenable, `rouge-adestia-pages-4`) ; avant elle **`v0.98.0-adestia-pages.3`** (trois tests instables, `rouge-adestia-pages-1`), **`v0.98.0-adestia-pages.2`** (tranche 1 : galerie et déplacement des blocs) ; avant elles **`v0.98.0-adestia-pages.1`** (préversion de l'epic `adestia-pages` : doc seule, l'étape vitest rouge de 28e089c9 rapportée à ses trois tests instables, `rouge-adestia-pages-2`) ; avant elle **`v0.97.17`** (le test CRLF de `/planif` attend que les neuf notes soient rendues, `rouge-adestia-13`) ; avant elle **`v0.97.16`** (niveau local de tests et rejeu déclarés, `adestia-niveau-local`) ; avant elle **`v0.97.15`** (tests E-14 et E-10 qui attendent un signal, `rouge-adestia-11`) ; avant elle **`v0.97.14`** (page « accès refusé », `adestia-acces-refuse`) ; avant elle **`v0.97.13`** (correctif : les tests instables sous charge attendent des états ou un délai scalé par `ADESTIA_PATIENCE`, `rouge-adestia-10`) ; avant elle **`v0.97.12`** (correctif : `rapport-tests.json` est ignoré par git, `adestia-ignore-rapport`) ; avant elle **`v0.97.11`** (correctif du test de sauvegarde refusée des pages, autre locale, `rouge-adestia-7`) ; avant elle **`v0.97.10`** (correctif du test P-2 des onglets du rail et de celui de l'icône de liste, `rouge-adestia-8`) ; avant elle **`v0.97.9`** (correctif du test B-19 du bandeau « le serveur ne répond pas », instable sous charge, `rouge-adestia-5`) ; avant elle **`v0.97.8`** (correctif de cinq tests instables sous charge, `rouge-adestia-9`) ; avant elle **`v0.97.7`** (correctif du test de sauvegarde refusée des pages, `rouge-adestia-6`) ; avant elle **`v0.97.6`** (entrée du CHANGELOG ; la preuve de test devient l'attestation de la chaîne, `feature/adestia-preuve-tests` : le tag est posé à la fusion dans `main`) ; avant elle **`v0.97.5`** (correctif du balayage skippy et du test CRLF des pages, `rouge-adestia-4`) ; avant elle **`v0.97.4`** (correctif de deux tests de pages, `rouge-adestia-3`) ; avant lui **`v0.97.3`** (correctif de l'authentification Copilot, fusion de `feature/adestia-copilot-auth`) ; avant lui : **`v0.97.2`** (correctif des sondes eslint du bloc R-8, posé sur `main` par la fusion de `rouge-adestia-2`), **`v0.97.1`** (correctif de la garde B-5, fusion de `rouge-adestia-1`), puis **`v0.97.0`** (`git describe --tags --abbrev=0`, posé sur `main` par la fusion de l'epic
  `adestia-ajouts` ; ses préversions `v0.97.0-adestia-ajouts.1` à `.12` sont posées sur sa branche) ; le tag précédent
  dans `main` était `v0.96.1` (correctif de la garde `besoin-pages-statique`, fusion de `adestia-correctif-garde-changelog`), avant lui `v0.96.0` (l'epic `adestia-correctifs`).
- Branche de travail : `feature/rouge-adestia-pages-24` (deux rouges instables de la suite navigateur : code du produit, `useConversations.ts` : un message envoyé à l'instant où le tour se règle et dont le consommateur a déjà fini (son `attach` a répondu 204) n'est plus laissé en bulle `held` sans suiveur, la bulle est retirée et le flux neuf suivi par `pump` (test sans navigateur `conversations-bulle-en-attente.test.tsx`) ; test seul : `recette-formulaires-browser.test.ts` passe tous ses délais par `patience()` (`ADESTIA_PATIENCE`), attend la troisième ligne de la timeline après « Add » et remplace ses boucles de 500 ms par `expect.poll` ; pas encore livrée dans `epic/adestia-pages` : pas de tag tant que la phase merge n'a pas fusionné. **Piège** : si `skin dobby` rougit encore, chercher une bulle `held` sans tour suivi, non une lenteur). Les branches `rouge-adestia-pages-*` précédentes sont au CHANGELOG ; `feature/adestia-pages-structure` (tranche 3, voir la section ci-dessous) est livrée avec l'epic.
- Déploiement actuel des instances Alfred, Skippy et Nestor : **non attesté ici**. La dernière
  mention commune dans l'ancien état est v0.81.0 le 30/09 ; v0.87.2 est dite
  déployée le 15/10 sans détail par instance déployée. Cela ne prouve pas leur version actuelle.
- Histoire et décisions des chantiers clos : [CHANGELOG.md](../CHANGELOG.md).

## Tranche 3 d'`adestia-pages` : sections et colonnes (`feature/adestia-pages-structure`)
Construit : `section`, `columns`, `col` imbriqués par la clôture (AD-32), lus (repli local jamais écrit, empilés sous 820 px), édités
(galerie, choix 2/3 dans les réglages) et déplacés dans, hors et entre conteneurs (AD-structure-1). Corpus de B-31 :
`packages/content/test/fixtures/corpus/`, 200 pages (`.md`, 200 `.html`) ; 79 `.out` épinglent la réécriture de `main` pour les pages non canoniques, ses `.html` le DOM du
lecteur ; `CORPUS_WRITE=1` ne les régénère que si une page doit changer, et le commit le dit. Voir une page à colonnes : `node bench/launch.mjs --engine fake --seed pages`, puis ajouter Section ou Colonnes depuis la galerie (`/`). Pièges : la carte de `:::row` s'appelle
« Line break » ; le code dit `range` là où l'AD disait `bounds` ; une insertion écrit des paragraphes vides, normalisés à la relecture ;
`adestia-section`/`adestia-fold` existent déjà, d'où `adestia-block-section` ; à 1280 px la raison d'un refus est tronquée à droite (la zone live
la dit en entier) ; ni `fr`, ni sombre, ni téléphone regardés pour l'édition.

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
- Les formulaires de données (E-35) existent pour `figures`, `list`, `table`, `timeline` et les blocs
  dont le manifeste déclare `fields` ; un bloc sans `fields` se corrige dans ses lignes brutes.
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
  une fois dans `buildDesk` (AD-30). `--engine fake` n'a pas `POST /api/restart` : lire `maxConcurrentTurns` demande le vrai binaire.
- Page ouverte : le bandeau compare la révision de `useAutosave`, pas `page.revision` ; après une panne du serveur rien
  n'est rattrapé avant le lot suivant (AD-27 rejette le sondage) ; seul le Reload de l'utilisateur remplace la saisie (AD-21).
- Retrait d'un serveur MCP : le focus initial sur Cancel vient de `data-autofocus` dans `ui/focus.ts` (AD-31) ; un effet
  dans le pied de feuille serait écrasé par celui du scope.
- Bandeau hors ligne : la sonde appelle le `fetch` détaché de son ref (sinon « Illegal invocation », lu comme une sonde
  échouée), ce que seuls les tests en navigateur voient (`besoin-hors-ligne-browser.test.ts`, instable une fois sous charge).
  Le cas « tous les appels /api/ échouent » ne re-provoque plus en boucle : il attend la fin des appels en vol, en provoque un
  seul, puis attend le signal de la 2e sonde et du bandeau (`rouge-adestia-pages-6`). Un succès tardif d'un appel antérieur
  arrête la boucle de sonde de `serverReach.ts` : c'est sa règle, non une course du produit. Le fichier
  `besoin-charte-comportement.test.ts` démarre une instance par visite et porte un budget de 120 s à son `describe` racine ;
  le badge du cadenas (E-11) s'attend sur sélecteur. Des délais fixes restent ailleurs dans ces tests (`visit` : 600 ms).
- Le bandeau hors ligne colle sous l'en-tête du canevas par `top: var(--canvas-header-h)`, la variable que l'en-tête prend aussi pour `min-height` : un 56px en dur laissait une fente de 2 à 4 px (`offline-banner-sticky.test.ts`).
- Chat : la relance sans session n'a lieu que sur le refus exact de Claude, avant tout texte (AD-28) ; seul Claude porte
  la marque. `claude-lost-session.real.test.ts` est sauté sans `CLAUDE_CODE_OAUTH_TOKEN` : un `npm test` vert sans jeton
  ne le prouve pas. Le banc de chaque tranche : `node bench/scenarios/<chargements|page-suivie|hors-ligne|chat-ajouts>.mjs`.

## À moitié construit

- La question de permission ne permet pas de corriger la règle proposée par le
  moteur ; `AskPrompt` ne renvoie que `once`, `always` ou `deny`. Copilot ne porte
  toujours pas le retour interactif (`drivers.ts`).
- `feature/adestia-pages-deplacer` (tranche 1 de l'epic `adestia-pages`, livrée sur `epic/adestia-pages`) : déplacer un bloc au niveau de la page par `editor/moveBlock.ts` (boutons Move up/down, `Alt+↑/↓`, appui long de 400 ms puis glisser, zone live) ; la galerie `Add block` / « Browse » (`editor/BlockGallery.tsx`, `gallery.ts`, `insertionPoint.ts`) et le contrat `gallery` du manifeste de plugin (`packages/schemas/src/plugin.ts`). **Reste** : sections, colonnes, déplacement entre conteneurs et refus de dépôt (tranche 3), modèles de page (tranche 4) ; `moveBlock` reçoit `toParent` mais n'est appelé qu'avec la racine. Recette de la galerie : après le build, `node bench/launch.mjs --engine fake --seed pages`, puis `BENCH_URL=<url> node bench/scenarios/pages-matrix.mjs bench/scenarios/galerie.mjs` ; le déplacement n'a pas de scénario, ses tests unitaires (`packages/web/test/move-block.test.ts`) le prouvent. **Piège** : sans sélection choisie, la galerie insère en fin de page, car la sélection initiale de ProseMirror n'est le choix de personne.
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

- **Popover : les frontières se relisent, ne se figent pas.** `Popover.tsx` interroge `.adestia-canvas__header`, `.adestia-console-host`, `.adestia-problems` et `.adestia-editor__readonly` à chaque placement ; un nouveau bandeau du canvas doit rester dans cette liste de sélecteurs pour être évité (le `MutationObserver` ne fait que déclencher le placement).
- **Balayage E-26 (voyages) sous charge** : l'écran charge tous les plugins puis demande `/voyages` au serveur ; la preuve `.voyages-page .vhub-card` attendait 15 s fixes, que la suite entière (navigateurs en parallèle) peut dépasser sans que le plugin soit en défaut. Seul, l'écran se prend en 5 s ; sur un cœur chargé, 3 fois plus lent, toujours vert. Aucune course du produit retrouvée (l'échec n'a pas été reproduit ici). La capture d'un écran vit désormais dans `bench/lib/capture.mjs` : toutes les attentes d'apparition (shell, écran du téléphone, preuve) durent `APPEAR_MS` = 60 s, et un écran dont l'attente expire est repris une fois dans un contexte neuf ; au second échec, l'erreur nomme la preuve manquante, dit ce que la page montre et qu'il s'agit du second essai (`rouge-adestia-pages-16` ; `packages/server/test/sweep-reprise.test.ts` le prouve sur une page factice). Le plafond de `bench-ensemble.test.ts` passe à 1 800 s (deux attentes de 60 s possibles par écran lent) ; écrans, sélecteurs et captures inchangés. Si le test rougit encore, ce n'est plus la charge mais un écran qui ne rend pas.
- **Attentes de test : une seule patience.** `ADESTIA_PATIENCE` (entier, 1 par défaut ; 4 sur l'étape vitest de `scripts/suite-attestee.sh`) met à l'échelle les délais des tests Playwright et ceux des tests jsdom qui l'importent, comme `mcp-loading.test.tsx` (`packages/web/test/patience.ts`) et des gestes du balayage (`bench/sweep.mjs` ; l'attente de la preuve d'un écran, elle, est `APPEAR_MS` de `bench/lib/capture.mjs`, qui reprend une fois un écran dont le sélecteur manque). Un nouveau test navigateur passe ses délais par `patience()` ; un `waitForTimeout` porte `// pause fixe : <raison>`. Cette règle vaut pour les sept fichiers `besoin-*` corrigés par `rouge-adestia-10` ; les autres tests navigateur (par ex. `besoin-chargements-browser.test.ts`, `besoin-hors-ligne-flux.test.ts`, le helper `charte-browser.ts`, scénarios de `bench/` ; liste non exhaustive) ne l'appliquent pas encore. Livré par `rouge-adestia-10` (tests et `bench/` seuls, code du produit inchangé ; `page-follows-feed.test.tsx` attend l'import à froid de l'éditeur dans un `beforeAll`). Les tests Playwright ne se jouent pas dans un pod sans Playwright : la preuve est l'attestation de la chaîne.

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
