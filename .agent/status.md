# Status — Golem
> MàJ : 2026-08-21

**État :** GOLEM S'INSTALLE. Image Docker construite et vérifiée en exécution
réelle (plugin monté en volume, pages lues du workspace, coque servie).
Persistance des conversations en JSONL par utilisateur (transcript riche :
trace outils, interruption, usage), overrides d'environnement + interpolation
de secrets. **285 tests au vert.**

**Prochaines étapes :**
- [ ] Brancher l'UI sur les conversations (liste, reprise, suppression)
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Armement de token (authManagement) dans l'UI + driver copilot-cli
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Publier l'image sur ghcr.io (workflow CI)
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
