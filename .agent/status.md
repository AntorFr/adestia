# Status — Golem
> MàJ : 2026-08-21

**État :** GOLEM DÉMARRE ET RÉPOND. Binaire `golem` fonctionnel : charge la
config, crée le workspace, découvre les plugins d'un dossier monté (sans
rebuild), sert, et exécute un vrai tour d'agent Claude Code en streaming
(vérifié de bout en bout : deltas de texte, compteur de tokens, usage complet).
**186 tests au vert, typecheck propre.** Manque encore l'UI React elle-même.

**Prochaines étapes :**
- [ ] Composants React : coque, chat streamé, canvas, pastille de contexte + build Vite servi par Fastify
- [ ] Éditeur Milkdown branché sur packages/content (pipeline prêt)
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Armement de token (authManagement) + driver copilot-cli
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
