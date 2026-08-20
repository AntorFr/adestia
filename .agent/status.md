# Status — Golem
> MàJ : 2026-08-20

**État :** Coque serveur POSÉE et verte. `packages/server` : config YAML
déclarative (refus des clés inconnues), 3 modes d'auth (none/proxy/oidc, zéro
base users), découverte d'extensions (refus bruyant, un plugin cassé coûte sa
vue), app Fastify avec SSE de tour, cap de concurrence en 429 et point de spawn
unique. **133 tests au vert, typecheck propre.** Reste : packages/web.

**Prochaines étapes :**
- [ ] packages/web : coque React, import map, chargeur de plugins ESM, éditeur Milkdown, chat SSE
- [ ] Boucle OIDC (login/callback/session) — le module d'auth résout déjà l'identité
- [ ] Armement de token (authManagement) sur le driver claude-code + driver copilot-cli
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Upstream : bug ParserState Milkdown ; 2 fixes @tiptap/markdown
