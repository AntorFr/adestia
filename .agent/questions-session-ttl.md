# Questions — chantier durée de session

> Une question vivante à la fois ; les autres attendent leur tour, dans l'ordre.

| # | Question | État | Réponse |
|---|---|---|---|
| 1 | Créer la worktree `session-ttl` (branche du même nom) pour ce chantier ? | close | oui (16/09) |
| 2 | Aligner automatiquement la durée sur celle d'Authelia — est-ce seulement possible ? | close | **non** (16/09, vérifié) : le document de découverte n'annonce aucune durée de session, et ce que l'échange rend sont des durées de JETONS. Et il n'y a pas une durée à copier : session courte par défaut, trois mois si la personne coche « se souvenir de moi », choix que le client ignore. |
| 3 | Alors : durée fixe configurable, ou adossement au jeton de rafraîchissement ? | close | **les deux** (16/09, tranché par le propriétaire) : la durée configurée est le plafond ; là où un jeton de rafraîchissement existe, sa disparition écourte la session. Rien de neuf n'est demandé au login, donc Nestor et Skippy continuent de ne rien détenir. |
| 4 | La constatation d'un grant révoqué est-elle immédiate ? | close | non, par choix (16/09) : elle a lieu quand un tour a besoin d'un jeton. L'immédiat coûterait un aller-retour vers Authelia à chaque requête. |

## Ce qui reste à faire hors du dépôt

Au déploiement : `auth.oidc.sessionTtlMs: 2592000000` (30 jours) dans les trois
manifestes de `k8s-home-lab`. Sans la clé, une instance garde ses 12 h.
