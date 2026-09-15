# Status — Adestia
> MàJ : 2026-09-15

**État :** chantier `refonte` (worktree du même nom) — une passe de revue sur
tout le dépôt : code mort retiré et gardé par le compilateur, doublons
mutualisés (persistance d'un tour, frontmatter, jeton des pilotes, aides du
banc), doc remise d'aplomb, serveur et web découpés en modules sans changer
une ligne de corps, outillage rendu fiable en worktree (typecheck, tests et
build lisent les sources d'à côté). Typecheck, lint, build et 2125 tests
verts ; banc visuel passé. L'état reconstruit qui a servi de base est dans
`mission-refonte.md`, les questions en suspens dans `questions-refonte.md`.

**Prochaines étapes :**
- [ ] Kit d'aides porté par le cœur pour les plugins (slug, frontmatter,
      cache) — question 4, ouverte.
- [ ] Types du protocole (`TurnEvent`, conversations, `McpServerView`)
      déclarés une fois dans `schemas` — question 5, ouverte.
- [ ] Retirer `@vitejs/plugin-react` de `packages/web` : déclaré, jamais
      chargé ; demande l'outil npm qui réécrit le lockfile, puis revérifier le
      fork du parseur.
- [ ] Fusionner `refonte` dans `main`, une fois les questions closes.

**Restes ouverts des chantiers passés** (relevés au dégraissage de ce fichier,
non revérifiés un par un ; l'historique complet est dans git) :
- [ ] Le fil « tuyau Festool » d'Alfred reste coupé en deux côté moteur.
- [ ] Le banc mesure en pixels ce qu'il photographiait ; à généraliser.
- [ ] Éditer les attributs d'un bloc depuis l'interface (le `type` d'un
      `:::content`, le `title:` du frontmatter).
- [ ] L'éditeur embarqué dans un plugin est amputé : ni `attach`/`compose`,
      ni bandeau de pièces jointes, ni `pages` pour les `[[type#id]]`.
- [ ] La puce `tache` et le crayon de l'éditeur embarqué s'affichent sous le
      titre « Note » d'une fiche.
- [ ] `‹ Back` du shell est en dur en anglais (`App.tsx`).
- [ ] `todo-config` : le raisonnement « premier par ordre de chemin » réparé
      pour `me:` vaudrait aussi pour `folder:`.
- [ ] Les six phrases anglaises de `todo/web/app.js`.
- [ ] `journal` : pas encore vérifié en navigateur ; `api.trail` sans test.
- [ ] Pilote Copilot : pas de plomberie de permissions, la porte planif ne
      s'y applique pas.
- [ ] PWA : l'invite d'installation à constater sur un vrai appareil ; le
      hors-ligne des tuiles de carte de `parcours`.
- [ ] Backlog UX du 26/08 : deux bugs de la vague 1 (pop-up d'autorisation
      qui ne se ferme pas, fiche `adestia-evolutions` absente de la nav).
- [ ] Plugin `project-management` : son `kind` (feature ou app) reste à
      arbitrer le jour des surcharges (`table{type=risques}`, contributeurs).
