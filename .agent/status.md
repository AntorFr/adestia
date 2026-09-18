# Status — Adestia
> MàJ : 2026-09-18

**État :** `main`, **v0.61.0** : une page occupe un grand écran. Le canevas
monte à 1400 px (940 avant) ; la prose garde une mesure, relevée à 89ch
(~830 px, choix de l'utilisateur sur son écran, au-delà des 70 classiques),
et tout ce qui se parcourt plutôt qu'il ne se lit — tableaux, bandeaux `w=`,
chiffres, cartes, blocs de plugins — prend la largeur du canevas. Même
partage dans l'éditeur. L'en-tête d'un bloc `:::content` est redessiné
(pastille, titre serif, signature mono à droite, bandeau dans une carte), et
le vide de 35 px en haut des cartes a disparu. Scénario de banc :
`page-width`. Pas encore déployée.

Depuis (pas encore tagué) : `title=` et `ico=` sont RÉSERVÉS, comme `w` — tout
bloc, du cœur ou d'un plugin, peut porter un titre et une icône, et le lecteur
dessine l'en-tête : première ligne de la boîte d'une liste, première ligne d'un
encadré, au-dessus du reste. Signalé à l'usage : un `:::list{title=…}` passait
avec un simple avertissement et s'affichait sans titre. Scénario de banc :
`block-titles`.

v0.60.0 (16/09, déployée sur les trois corps) : la durée de session est un
réglage, `auth.oidc.sessionTtlMs`, et un grant mort l'écourte.

**Prochaines étapes :**
- [ ] Déployer v0.61.0 sur les trois corps (bump d'image dans `k8s-home-lab`).
- [ ] Date d'un bloc `:::content` au format de la langue (« 9 sept. 2026 ») :
      demande de passer la locale de l'instance jusqu'au `Reader`, pas fait.
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
- [x] Fait le 16/09 : `auth.oidc.sessionTtlMs: 2592000000` (30 jours) sur les
      trois, dans le même commit cluster que le bump d'image.
- [x] Fait au déploiement du 16/09 : `collections` retiré d'`extensions.apps`
      chez Alfred et Skippy (Nestor ne le portait pas), dans le même commit
      que le bump d'image — le pod reçoit image et conf d'un coup. Les trois
      démarrent proprement : 8, 2 et 8 plugins actifs sur 11, aucun avis.
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
