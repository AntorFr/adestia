# Status — Golem
> MàJ : 2026-08-20

**État :** Moteur de contenu POSÉ et vert. `packages/content` : pipeline remark
unique (frontmatter + directives + wikilinks + gfm), vocabulaire fermé déclaré
comme donnée, validation par diagnostics (lecture seule, jamais de refus sec ni
de réécriture silencieuse). Harnais du spike PROMU en suite de conformité avec
ses fixtures. **54 tests au vert, typecheck propre.** server/web = coquilles.

**Prochaines étapes :**
- [ ] packages/drivers : adaptateur claude-code (Agent SDK TS) + faux binaire de test
- [ ] packages/server : Fastify, découverte plugins/skins, SSE de tour, modes d'auth
- [ ] packages/web : coque React, import map, éditeur Milkdown sur le pipeline
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Upstream : bug ParserState Milkdown ; 2 fixes @tiptap/markdown
