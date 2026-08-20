# Status — Golem
> MàJ : 2026-08-21

**État :** GOLEM A UN VISAGE. Interface React servie par Fastify, vérifiée dans
un vrai Chrome : split view réglable (Pointer Events + clavier), chat streamé,
trace outils, pastille de contexte, permissions, bascule mobile fonctionnelle,
plugin chargé À CHAUD depuis un dossier monté avec React partagé par import map
et CSS injecté par la coque. **220 tests au vert, typecheck propre.**

**Prochaines étapes :**
- [ ] Éditeur Milkdown branché sur packages/content (pipeline prêt) + API de pages
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Armement de token (authManagement) dans l'UI + driver copilot-cli
- [ ] Persistance des conversations (transcript riche, rejeu fidèle)
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Dockerfile + compose ; README d'installation
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
