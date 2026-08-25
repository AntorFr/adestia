# Status — Golem
> MàJ : 2026-08-25

**État :** Migration Alfred. Faits et vérifiés en navigateur : `todo`,
`planif`, `collections`, `scan`, skin `alfred`. 936 tests + 85 de plugins.
Facette `blocks` CÂBLÉE : elle était chargée et narrowée depuis le début, et
personne ne lisait le résultat. Un bloc se déclare en deux moitiés — le
manifeste (`vocabulary`) dit ce qu'il EST, pour que le SERVEUR le valide sans
exécuter de code navigateur ; le module dit à quoi il ressemble. Le pont `{% %}`
suit le vocabulaire, donc une fiche partagée rend un bloc de plugin sans être
réécrite. Premier client : `parcours` porté (carte sans biblio, profil, mode
balade, GPX octet-pour-octet identique au prédécesseur) — sauf le hors-ligne,
qui demande un service worker que Golem n'a pas. **Livré en 0.5.0 et déployé**
sur homenode, `features: [scan, parcours]` : 7 plugins sur 7 actifs.
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
Contexte d'écran porté d'agent-gw (oublié par l'audit de parité) : chaque
message emporte `view: {route, title}`, le serveur préfixe le prompt d'une
ligne — route et fil d'Ariane seulement, jamais le rendu de la page, rien
depuis l'accueil ni depuis un mobile replié sur le chat. Encadrement fait
côté serveur, donc le fil stocke le prompt brut (pas de dé-préfixage au
rejeu, contrairement au prédécesseur). Route/titre aplatis sur une ligne et
bornés : un `#` est pilotable par un lien.
Propriété d'un dossier = règle de ROUTAGE (`app/owners.ts`) : `absorbs` ne
servait qu'à retrancher une tuile de l'accueil, donc le fil d'Ariane d'une
fiche de voyage repartait sur `#/section/…` (la liste générique) au lieu du
voyage. La coque sait QUI possède le dossier, le plugin dit OÙ par un
`routeFor(dossier)` optionnel — appliqué aux liens dessinés ET à la route
`/section/` elle-même (marque-pages, cibles écrites par l'agent). Sans réponse
du plugin : section générique, aucune devinette. Le fil remonte maintenant
TOUS les dossiers-lieux d'une fiche (`Accueil / Voyages / Brocéliande 2026 /
…`), les dossiers de regroupement (`domaines/`) exceptés, et il est dérivé une
seule fois — l'en-tête le dessine, le contexte d'écran l'emporte.
Adresses refaites : un voyage/workbook s'écrit par son NOM
(`#/voyages/baden-2026`, `#/atelier/rangement-garage`), résolu contre le
listing du plugin — repli sur le chemin si le nom est pris deux fois, et
TOUTES les anciennes formes restent lues (aucun favori ni lien de fiche ne
meurt). Les routes de la coque (`#/page/…`, `#/section/…`) et `parcours`
encodent désormais segment par segment : plus de `%2F`. Règle par plugin dans
son `web/address.js`, pure et testée.

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
