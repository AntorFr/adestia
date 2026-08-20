# Status — Golem
> MàJ : 2026-08-20

**État :** Squelette monorepo POSÉ et vert. 5 paquets (schemas / content /
drivers / server / web), npm workspaces + TypeScript strict + Vitest.
Premier code réel : contrat driver v0 (capabilities, machine d'états d'auth,
événements de tour) avec conformance mécanique, et schemaVersion 1 des
manifestes plugin/skin avec validation à refus bruyant. **30 tests au vert,
typecheck propre.** content/server/web sont encore des coquilles.

**Prochaines étapes :**
- [ ] packages/content : pipeline remark (frontmatter + directives + wikilinks), harnais du spike Milkdown promu suite de conformité
- [ ] packages/drivers : adaptateur claude-code (Agent SDK TS) + faux binaire de test
- [ ] packages/server : Fastify, découverte de plugins, SSE de tour, modes d'auth
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Upstream : bug ParserState Milkdown ; 2 fixes @tiptap/markdown
