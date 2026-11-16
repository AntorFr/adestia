# Durée « avant » des tests d'écran

Mesurée sur `main` (`c1eb256b`, branche `task/adestia-tests-hors-ecran-cadre` sans autre changement du produit), avant tout allègement.

- **Commande** : `node scripts/mesurer-tests-ecran.mjs --sortie /tmp/avant` après `npm ci` et `npm run build`. Un fichier à la fois, sans autre charge sur la machine. Un fichier `.ts` joue `npx vitest run --maxWorkers=1 --testTimeout=30000 --hookTimeout=60000 --reporter=junit <fichier>` avec `BENCH_FULL_SWEEP=1 ADESTIA_PATIENCE=4` (les options de la suite attestée) ; un fichier `.mjs` joue `node --test --test-reporter=junit <fichier>`. La durée est celle de la commande entière, démarrage compris.
- **Machine** : pod `sdlc-adestia-tests-hors-ecran-cadre-dev-1`, 18 cœurs (`nproc`), Playwright et Chromium présents (`/opt/ms-playwright`), Node du pod.
- **Rejouer** : le même script, avec `--grappe <nom>` pour une grappe ; la durée « après » se mesure avec la même commande.

## Total

**6260.3 s (104 min 20 s)** pour 44 fichiers.

| Grappe | Durée | Tests | Sautés |
|---|---|---|---|
| web-chat-charte | 1297.2 s (21 min 37 s) | 229 | 0 |
| web-hors-ligne-acces | 281.6 s (4 min 41 s) | 58 | 0 |
| web-mcp-pages | 453.5 s (7 min 33 s) | 242 | 0 |
| bench-chat | 583.3 s (9 min 43 s) | 353 | 3 |
| bench-pages | 1522.7 s (25 min 22 s) | 650 | 0 |
| bench-plugins-shell | 1222.1 s (20 min 22 s) | 1267 | 0 |
| serveur | 899.9 s (14 min 59 s) | 88 | 0 |
| **total** | **6260.3 s (104 min 20 s)** | 2887 | 3 |

## Par fichier

| Grappe | Fichier | Durée (s) | Tests | Sautés |
|---|---|---|---|---|
| web-chat-charte | `packages/web/test/besoin-chat-browser.test.ts` | 766.5 | 56 | 0 |
| web-chat-charte | `packages/web/test/besoin-chat-narrow-browser.test.ts` | 20.9 | 8 | 0 |
| web-chat-charte | `packages/web/test/besoin-chargements-browser.test.ts` | 79.6 | 108 | 0 |
| web-chat-charte | `packages/web/test/besoin-charte-browser.test.ts` | 300.3 | 28 | 0 |
| web-chat-charte | `packages/web/test/besoin-charte-comportement.test.ts` | 110.8 | 23 | 0 |
| web-chat-charte | `packages/web/test/besoin-tours.test.ts` | 19.1 | 6 | 0 |
| web-hors-ligne-acces | `packages/web/test/besoin-hors-ligne-browser.test.ts` | 171.4 | 18 | 0 |
| web-hors-ligne-acces | `packages/web/test/besoin-hors-ligne-bords.test.ts` | 20.8 | 4 | 0 |
| web-hors-ligne-acces | `packages/web/test/besoin-hors-ligne-flux.test.ts` | 15.4 | 2 | 0 |
| web-hors-ligne-acces | `packages/web/test/ensemble-hors-ligne-browser.test.ts` | 63.7 | 23 | 0 |
| web-hors-ligne-acces | `packages/web/test/ensemble-acces-refuse-browser.test.ts` | 10.3 | 11 | 0 |
| web-mcp-pages | `packages/web/test/besoin-mcp-browser.test.ts` | 109.3 | 90 | 0 |
| web-mcp-pages | `packages/web/test/besoin-pages-browser.test.ts` | 160.5 | 96 | 0 |
| web-mcp-pages | `packages/web/test/besoin-pages-ensemble-browser.test.ts` | 183.7 | 56 | 0 |
| bench-chat | `bench/tests/chat-besoin.test.mjs` | 258.8 | 179 | 1 |
| bench-chat | `bench/tests/chat-chargements-besoin.test.mjs` | 234.1 | 96 | 0 |
| bench-chat | `bench/tests/chat-correctifs-besoin.test.mjs` | 57.4 | 52 | 0 |
| bench-chat | `bench/tests/chat-correctifs-course.test.mjs` | 2.6 | 1 | 0 |
| bench-chat | `bench/tests/chat-p2-besoin.test.mjs` | 6.5 | 7 | 0 |
| bench-chat | `bench/tests/chat-p2-gestes-besoin.test.mjs` | 13.8 | 12 | 0 |
| bench-chat | `bench/tests/chat-session-perdue-besoin.test.mjs` | 0.1 | 2 | 2 |
| bench-chat | `bench/tests/diagnostics-phone-besoin.test.mjs` | 10.0 | 4 | 0 |
| bench-pages | `bench/tests/pages-besoin.test.mjs` | 403.7 | 307 | 0 |
| bench-pages | `bench/tests/pages-verify.test.mjs` | 314.5 | 172 | 0 |
| bench-pages | `bench/tests/page-suivie-besoin.test.mjs` | 561.9 | 131 | 0 |
| bench-pages | `bench/tests/page-suivie-complement-besoin.test.mjs` | 129.3 | 24 | 0 |
| bench-pages | `bench/tests/page-suivie-suites-besoin.test.mjs` | 113.3 | 16 | 0 |
| bench-plugins-shell | `bench/tests/plugins-besoin.test.mjs` | 315.4 | 216 | 0 |
| bench-plugins-shell | `bench/tests/plugins-chargements-besoin.test.mjs` | 242.9 | 264 | 0 |
| bench-plugins-shell | `bench/tests/plugins-chargements-ensemble.test.mjs` | 193.3 | 200 | 0 |
| bench-plugins-shell | `bench/tests/plugins-chargements-retry-besoin.test.mjs` | 109.4 | 168 | 0 |
| bench-plugins-shell | `bench/tests/plugins-ensemble.test.mjs` | 285.5 | 320 | 0 |
| bench-plugins-shell | `bench/tests/shell-besoin.test.mjs` | 64.0 | 81 | 0 |
| bench-plugins-shell | `bench/tests/dette-ensemble.test.mjs` | 11.4 | 15 | 0 |
| bench-plugins-shell | `bench/tests/playwright-une-fois.test.mjs` | 0.2 | 3 | 0 |
| serveur | `packages/server/test/bench-besoin.test.ts` | 364.0 | 15 | 0 |
| serveur | `packages/server/test/bench-ensemble.test.ts` | 351.3 | 8 | 0 |
| serveur | `packages/server/test/bench-launcher.test.ts` | 12.0 | 16 | 0 |
| serveur | `packages/server/test/bench-sweep.test.ts` | 132.3 | 9 | 0 |
| serveur | `packages/server/test/catalogues-provenance-ui-ensemble.test.ts` | 8.7 | 2 | 0 |
| serveur | `packages/server/test/catalogues-retrait-ecran-ensemble.test.ts` | 7.4 | 2 | 0 |
| serveur | `packages/server/test/catalogues-retrait-imports-ecran-ensemble.test.ts` | 9.0 | 3 | 0 |
| serveur | `packages/server/test/catalogues-ui-ensemble.test.ts` | 10.7 | 7 | 0 |
| serveur | `packages/server/test/qualite-serveur-ensemble.test.ts` | 4.5 | 26 | 0 |

## Rouges et sautés de `main`, hors de cette tâche

Les fichiers `bench/tests/*` ne sont pas joués par la suite attestée (elle n'en joue que deux gardes) : ces rouges y étaient avant la tâche, la durée est mesurée quand même.

- `bench/tests/chat-correctifs-besoin.test.mjs` : « the unreleased section names the race of the chat… » (section du CHANGELOG).
- `bench/tests/pages-besoin.test.mjs` : « P-6 · editor… a warning says so » (texte « The page changed. » au lieu de « The agent changed this page… »), « Q-23 · home… Loading » et « …hold no function longer than 250 lines » (`app/App.tsx:40`, 267 lignes).
- `bench/tests/pages-verify.test.mjs` : « …hold no function longer than 250 lines ».
- `bench/tests/plugins-ensemble.test.mjs` : « discard_drops_the_hand_layout_the_chip_goes_and_the_file_has_no_pose ».
- Sautés, sans rapport avec Playwright : « a real Claude turn » (`chat-besoin`) et les deux « B-22 real Claude » (`chat-session-perdue-besoin`), faute de `CLAUDE_CODE_OAUTH_TOKEN`.
