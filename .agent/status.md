# Status — Adestia
> MàJ : 2026-09-16

**État :** chantier `concepts` (worktree du même nom) — le code rapproché de
ce que `DESIGN.md` dit aujourd'hui, en cinq pas : le chat relit le fil au
magasin après tout tour au lieu de le classer lui-même ; l'horloge et le
rappel MCP passent par le bureau des tours (un seul point de lancement), le
tour sans fil est nommé (question éphémère) et le web ne l'emprunte plus par
accident ; un seul mot pour le fil (« conversation »), « session » réservé à
la session moteur ; la règle `app:` du 10/09 et le récit du chantier écrits
dans `DESIGN.md` ; les collections dessinées par le cœur (`type: collection`,
`into:`), le plugin retiré. Typecheck, lint, 1568 + 566 tests verts ; banc visuel :
les 5 scénarios du chat relancés et regardés après chaque pas, la passe
complète faite le 16/09 — 33 verts, `journal-blocs` rouge comme sur `main`
(bouton disparu), `live-codex` sauté (vrai moteur). Le glossaire qui a servi
de mesure est dans `mission-concepts.md`, les décisions prises par défaut
dans `questions-concepts.md` (chacune réversible d'un mot).

**Prochaines étapes :**
- [ ] (décidé le 15/09 : PAS de kit d'aides porté par le cœur ; les plugins
      gardent leurs copies de `slugOf`, `slugify`, du parseur de frontmatter
      et de `makeCache` — cinq lignes chacune, et un plugin reste un dossier
      autonome qui n'importe que React.)
- [x] (fait le 15/09 : conversations et vue MCP déclarées une fois dans
      `schemas/src/protocol.ts` ; les événements de tour restent ceux du
      contrat pilote, importés en type seulement par le web. Déclaration de
      `@antorfr/adestia-schemas` dans `packages/web/package.json` faite le
      16/09, avec le retrait de `plugin-react`.)
- [x] `@vitejs/plugin-react` retiré de `packages/web` le 16/09 : déclaré,
      jamais chargé — le bundle sort avec la même empreinte qu'avant. Lockfile
      mis à jour par `npm install --package-lock-only` (ne touche pas aux
      paquets installés) : deux entrées changées, le fork du parseur intact.
- [x] Scénario de banc `journal-blocs` réécrit le 16/09 : il passe de bout en
      bout (12 captures). Trois choses avaient vieilli — le bouton
      « Enregistrer » (parti le 10/09), le sélecteur du titre d'une entrée, et
      les attributs des blocs dans ses fiches d'exemple. Il RAPPORTE un défaut
      réel au passage : insérer une table depuis le menu « / » écrit
      `:::table` avec un `<br />` dedans, et un second enregistrement se fait
      refuser en 422. À traiter à part, c'est l'insertion, pas le scénario.
- [ ] Au déploiement de cette version : retirer `collections` de
      `extensions.apps` dans les configs d'Alfred, Nestor et Skippy (le
      serveur signale un plugin inconnu au démarrage, la collection reste
      dessinée par le cœur).
- [x] Refonte structurelle fusionnée dans `main` le 15/09, tag `v0.58.0`.

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
