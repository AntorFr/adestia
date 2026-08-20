# Status — Golem
> MàJ : 2026-08-21

**État :** ARMEMENT DE TOKEN LIVRÉ (exigence v1). Flux `claude setup-token`
piloté depuis l'interface, secret stocké par le cœur en 0600, jamais renvoyé
au navigateur, rechargé au démarrage. UI de réglages rendue depuis le `mode`
du driver — un flux device-code s'affiche dans le même panneau sans changer
une ligne. **353 tests au vert.**

**Prochaines étapes :**
- [ ] Driver copilot-cli (le mock BYOK du spike rend tout testable sans compte)
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Publier l'image sur ghcr.io (workflow CI)
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
