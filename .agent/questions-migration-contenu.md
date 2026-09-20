# Questions — migration du contenu vers 0.65+ (`frame=card`, `show=`)

Le déploiement des trois corps en 0.67.0 est fait (19/09/2026). Le contenu
écrit avant 0.65 n'est PAS migré : `content{view=cards}`, `checklist{view=…}`
et les listes qui comptaient sur leur bordure par défaut ne rendent plus ce
qu'elles rendaient.

Règles de réécriture, vérifiées contre le code (pas déduites) :

| Avant | Après | Pourquoi |
|---|---|---|
| `content{… view=cards}` | `frame=card` | `view` a disparu du spec de `content` |
| `content{… view=plain}` | rien | c'était l'ancien défaut |
| `checklist`/`timeline`{… view=cards} | `frame=card` | ces blocs n'ont plus de `view` |
| `checklist{… view=open\|late\|today\|later\|all}` | `show=…` | le filtre s'appelle `show` (manifeste todo) |
| `list{…}` | `view` INCHANGÉ | `rows\|cards\|chips` reste la mise en page du dedans |

Script prêt et éprouvé sur des cas de test (réécriture idempotente, essai à
blanc par défaut) : `migrate-frame.mjs`, dans le bac à sable de la session
`46a2c1f6`. Après migration, le validateur ne rend plus aucun avertissement
sur les blocs du cœur.

## Q1 — Par quel chemin réécrire le contenu des trois corps ? CLOSE (20/09/2026)

**Réponse : « laisse comme ça ».** On ne migre pas. Le contenu écrit avant 0.65
reste en l'état, donc les sections `view=cards` s'affichent sans cadre, les
checklists `view=<filtre>` ne filtrent plus, et les listes en lignes sont nues.
Le script reste ici pour le jour où la question se reposera.

Voies qui étaient sur la table :

`kubectl exec` sur les pods est refusé par le classifieur (« Production
Reads »), en lecture comme en écriture. Deux voies :

- **a.** l'utilisateur autorise `kubectl … exec` dans `~/.claude/settings.json`
  (je mesure, je sauvegarde hors NFS, je réécris, je vérifie) ;
- **b.** chaque corps migre son propre contenu, via `ask_alfred` / `ask_skippy`
  / `ask_nestor` — ils portent la skill d'écriture à jour, mais une réécriture
  en masse par un agent se surveille.

Rappel : `memory/` d'Alfred n'est pas versionné → sauvegarde hors NFS AVANT
toute réécriture, quelle que soit la voie.

## Q2 — Les listes reprennent-elles leur cadre ? CLOSE avec Q1 (20/09/2026)

Elles restent nues.

Avant 0.65, une `:::list` en mode `rows` était encadrée d'office ; maintenant
elle est nue sauf `frame=card`. Restaurer le rendu d'avant veut dire ajouter
`frame=card` à toutes les listes en `rows` (le script sait le faire avec
`--frame-lists`) ; ne rien faire les laisse nues, ce qui est le dessin que
0.65 a voulu. C'est ce dessin-là qui l'emporte, par non-décision assumée.
