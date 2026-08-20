# Status — Golem
> MàJ : 2026-08-20

**État :** Driver claude-code POSÉ et vert. `packages/drivers` : contrat +
conformance mécanique + adaptateur Claude Code (Agent SDK 0.3.237) testé
contre un FAUX SDK — zéro compte, zéro réseau, zéro binaire. Streaming de
deltas, trace outils à cible courte (jamais l'input complet), compteur de
tokens vivant monotone, `stopped` matérialisé, `contextTokens` distinct du
cumul. **70 tests au vert, typecheck propre.** server/web = coquilles.

**Prochaines étapes :**
- [ ] packages/server : Fastify, découverte plugins/skins, SSE de tour, modes d'auth (none/oidc/proxy)
- [ ] packages/drivers : armement de token Claude (authManagement) + driver copilot-cli sur le mock BYOK du spike
- [ ] packages/web : coque React, import map, éditeur Milkdown sur le pipeline
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Upstream : bug ParserState Milkdown ; 2 fixes @tiptap/markdown
