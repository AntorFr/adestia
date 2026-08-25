# Status — Golem
> MàJ : 2026-08-25

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 917 tests + 85 de plugins.
Facette `blocks` CÂBLÉE : elle était chargée et narrowée depuis le début, et
personne ne lisait le résultat. Un bloc se déclare en deux moitiés — le
manifeste (`vocabulary`) dit ce qu'il EST, pour que le SERVEUR le valide sans
exécuter de code navigateur ; le module dit à quoi il ressemble. Le pont `{% %}`
suit le vocabulaire, donc une fiche partagée rend un bloc de plugin sans être
réécrite. Premier client : `parcours` porté (carte sans biblio, profil, mode
balade, GPX octet-pour-octet identique au prédécesseur) — sauf le hors-ligne,
qui demande un service worker que Golem n'a pas.
Missions ajoutées à planif (`until:` → la note se termine seule, `done:` par
l'agent, `expired:` par le produit), avec porte d'écriture par contenu sur la
zone planif — non couverte côté driver Copilot, qui n'a pas de broker.
Login Copilot : device-code relayé, sous pty (la question « stocker en clair ? »
n'est posée que sur un terminal), consentement explicite de l'utilisateur par
case à cocher. Vérifié de bout en bout contre un vrai compte, en conteneur sans
keychain — capture dans `spikes/copilot-cli/raw/login-device-code-plaintext.txt`.
Chrome d'édition Crepe réparée : Golem n'importait que la STRUCTURE du thème,
donc aucun `--crepe-*` n'était déclaré → barre d'outils, menu slash et poignée
de bloc invisibles (transparents, sans ombre). Le jeu complet est maintenant
dérivé des tokens dans `shell.css`, avec la gouttière que la poignée réclame ;
un test l'ancre au contrat de Crepe. Vérifié au navigateur, clair et sombre.

**Reste :**
- [ ] `atelier` — ~1 600 lignes (plan de débit, SVG). EN COURS.
- [x] `parcours` vérifié au navigateur (instance Docker, magasin d'alfred-beta
      copié) : les deux vues, la page `#/parcours/…`, l'éditeur (le bloc monte
      en nœud atomique, zéro erreur console), le GPX servi, la garde de chemin,
      et le refus 422 sur un attribut hors de l'ensemble fermé.
- [ ] `git` — non portable : spécifique au hub rosetta
- [ ] `npm run lint` ne tourne pas : eslint absent des devDependencies
- [ ] driver Copilot : pas de plomberie de permissions → la porte planif ne
      s'y applique pas (missions bornées par `until` malgré tout)
