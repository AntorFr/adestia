# Status — Golem
> MàJ : 2026-08-24

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 583 tests + 40 de plugins.
Login Copilot : device-code relayé, la question « stocker en clair ? » du CLI
est désormais posée à l'utilisateur (case à cocher) au lieu d'être auto-répondue.

**Reste :**
- [ ] `atelier` — ~1 600 lignes (plan de débit, SVG). EN COURS.
- [ ] `parcours` — géo/GPX, sans dépendance externe
- [ ] `voyages` — BLOQUÉ : clé Google, demande la déclaration de secrets
- [ ] `git` — non portable : spécifique au hub rosetta
- [ ] Login Copilot à valider sur une vraie machine sans keychain : le libellé
      exact de la question est INFÉRÉ, aucune capture dans `spikes/copilot-cli/raw/`
- [ ] `npm run lint` ne tourne pas : eslint absent des devDependencies
