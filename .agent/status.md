# Status — Golem
> MàJ : 2026-08-20

**État :** Spikes 1-3 terminés, vérifiés, VERDICT rendu : **Milkdown** (grammaire
remark partagée rendu/éditeur — cf. spikes/editor/VERDICT.md ; Tiptap = plan B
prouvé, BlockNote éliminé). DESIGN.md v4 à jour (table stack restaurée, verdict,
corrections Copilot 1.0.80, tests unitaires dès le premier paquet — demande
utilisateur). Spike 4 (concurrence vs quota) en attente d'un go explicite.

**Prochaines étapes :**
- [ ] Squelette monorepo pnpm (core / web / sdk / drivers) avec Vitest et suites de conformité dès le premier paquet
- [ ] Figer schemaVersion 1 des manifestes plugin/skin (nourri par les spikes)
- [ ] Contrat driver v0 (revue Fable suggérée avant gel)
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Upstream : bug ParserState Milkdown ; 2 fixes @tiptap/markdown
