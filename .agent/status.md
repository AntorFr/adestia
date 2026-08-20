# Status — Golem
> MàJ : 2026-08-21

**État :** LES DEUX MAINS ÉCRIVENT. Éditeur Milkdown branché sur le pipeline
partagé, vérifié de bout en bout dans un vrai navigateur : ouverture d'une
page, édition, sauvegarde, fichier sur disque intact (frontmatter, wikilinks,
blocs typés, attributs). API pages avec refus de conflit (l'agent écrit sans
prévenir), validation du vocabulaire au save, écriture atomique. Éditeur chargé
à la demande (1,2 Mo hors du bundle de la coque). **255 tests au vert.**

**Prochaines étapes :**
- [ ] Boucle OIDC (login/callback/session) — resolveIdentity est prêt
- [ ] Armement de token (authManagement) dans l'UI + driver copilot-cli
- [ ] Persistance des conversations (transcript riche, rejeu fidèle)
- [ ] Skills plugin-author / skin-author sur les schémas gelés
- [ ] Dockerfile + compose ; README d'installation
- [ ] Spike 4 — concurrence vs limites d'abonnement (go utilisateur requis)
