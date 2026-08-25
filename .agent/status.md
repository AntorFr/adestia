# Status — Golem
> MàJ : 2026-08-25

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 654 tests + 42 de plugins.
Missions ajoutées à planif (`until:` → la note se termine seule, `done:` par
l'agent, `expired:` par le produit), avec porte d'écriture par contenu sur la
zone planif — non couverte côté driver Copilot, qui n'a pas de broker.
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
- [ ] driver Copilot : pas de plomberie de permissions → la porte planif ne
      s'y applique pas (missions bornées par `until` malgré tout)
