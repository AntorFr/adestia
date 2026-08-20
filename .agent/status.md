# Status — Golem
> MàJ : 2026-08-20

**État :** Chantier LANCÉ. Repo créé (GitHub AntorFr/golem, public, MIT).
Conception close (DESIGN.md v3). Spikes 1-3 en cours d'exécution (workflow
parallèle) : 3 prototypes d'éditeur round-trip, chargeur ESM runtime, recon
Copilot CLI. Spike 4 (concurrence vs quota abonnement) différé — brûle du quota
réel, attend un go explicite.

**Prochaines étapes :**
- [ ] Dépouiller les spikes 1-3, verdict comparatif éditeur (moment Fable suggéré)
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
- [ ] Figer schemaVersion 1 des manifestes plugin/skin + points de contribution
- [ ] Squelette monorepo (core / web / sdk / drivers) et contrat driver v0
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Réserver le scope npm @antorfr (à la première publication)
