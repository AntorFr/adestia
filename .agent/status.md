# Status — Golem
> MàJ : 2026-08-21

**État :** Driver Copilot CLI + boucle OIDC livrés. Deux moteurs derrière le
même contrat (l'UI n'a pas changé d'une ligne), login OIDC générique avec
cookies signés sans état serveur. **418 tests au vert.**

**Prochaines étapes :**
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Bouton de connexion / déconnexion dans l'UI (mode oidc)
- [ ] Workflow CI (tests + build image)
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
