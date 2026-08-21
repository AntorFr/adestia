# Status — Golem
> MàJ : 2026-08-21

**État :** SPIKE 4 FAIT (le dernier). 27 tours réels, rafales 1→8 : recouvrement
réel (78 % d'efficacité à 8), zéro échec, zéro avertissement de quota, cache du
prompt partagé même en parallèle, ~300 Mo de RSS par CLI. `maxConcurrentTurns: 3`
confirmé — contrainte mémoire, pas API. **530 tests verts, CI verte.**

**Reste :**
- [ ] Sync git distante des instructions (module optionnel, v1.x par décision)
- [ ] **Revue utilisateur de l'ensemble** — tout le périmètre v1 est livré
