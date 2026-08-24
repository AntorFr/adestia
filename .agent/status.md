# Status — Golem
> MàJ : 2026-08-24

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 608 tests + 40 de plugins.
Login Copilot : device-code relayé, sous pty (la question « stocker en clair ? »
n'est posée que sur un terminal), consentement explicite de l'utilisateur par
case à cocher. Vérifié de bout en bout contre un vrai compte, en conteneur sans
keychain — capture dans `spikes/copilot-cli/raw/login-device-code-plaintext.txt`.

**Reste :**
- [ ] `atelier` — ~1 600 lignes (plan de débit, SVG). EN COURS.
- [ ] `parcours` — géo/GPX, sans dépendance externe
- [ ] `voyages` — BLOQUÉ : clé Google, demande la déclaration de secrets
- [ ] `git` — non portable : spécifique au hub rosetta
- [ ] `npm run lint` ne tourne pas : eslint absent des devDependencies
