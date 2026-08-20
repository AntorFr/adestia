# Status — Golem
> MàJ : 2026-08-20

**État :** Les 5 paquets existent et sont verts. `packages/web` : parseur SSE
incrémental + état de tour vivant (streaming, compteur de tokens, permissions,
interruption matérialisée), chargeur de plugins ESM runtime avec contrat
d'import map versionné. **168 tests au vert, typecheck propre.**
Reste à assembler : l'app React elle-même (composants, éditeur Milkdown monté
sur le pipeline, routage), et le binaire qui démarre tout.

**Prochaines étapes :**
- [ ] Composants React : coque, chat streamé, canvas d'apps, pastille de contexte
- [ ] Éditeur Milkdown branché sur packages/content (le pipeline est prêt)
- [ ] Binaire `golem` : charge la config, découvre, sert le web, démarre
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Armement de token (authManagement) + driver copilot-cli
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
