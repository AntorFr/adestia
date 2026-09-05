---
name: veille-json
description: >
  Le CONTRAT de l'app Veille (plugin `listening-post`) — les sources qu'on suit
  (`assets/veille.json`), la fiche d'une vidéo ou d'un épisode gardé (`type: ecoute`),
  le transcript rangé à côté, et l'outil qui va chercher les sous-titres. À lire dès
  qu'on te demande d'ajouter quelque chose à la veille, de dépouiller une vidéo, ou de
  dire ce qu'il y a de neuf / où un sujet a été abordé. Livré par le plugin avec le
  moteur qui le lit.
---

# La veille vidéo/audio — le contrat

Deux moitiés, et toute l'app tient dans la frontière entre elles.

**Ce qui attend** (la file) n'est pas de la mémoire : les nouveautés des flux et les
liens collés à l'écran vivent dans le `dataDir` de l'instance. Rien ne s'écrit dans le
workspace tant que personne n'a décidé de garder.

**Ce qui est gardé** est une **page** comme une autre — `type: ecoute` — avec, à côté
d'elle, ce qui a réellement été dit. C'est toi qui écris cette page : le transcript est
de la matière première, la fiche est un jugement.

> Les chemins ci-dessous sont ceux que **le produit** épelle : `veille/…`, sans le
> dossier qui les contient. Ce dossier est un réglage de l'instance — l'une l'appelle
> `pages`, l'autre `memory` — et une instance peut composer sa mémoire de **plusieurs**
> magasins, sur des disques différents. Le contrat `memory-stores` dit lesquels, et il
> n'est livré que s'il y en a plus d'un. Tes outils fichiers travaillent sur le disque,
> donc c'est là que tu vas chercher le préfixe, jamais dans cette page.

## Les sources qu'on suit — `**/assets/veille.json`

Déclarer une source, c'est écrire un fichier ; il n'y a aucun registre à tenir. Le
plugin ramasse **tous** les `assets/veille.json` sous les pages et les fusionne, si bien
qu'une veille par domaine est une façon légitime de ranger.

```json
{
  "version": 1,
  "sources": [
    { "id": "underscore", "titre": "Underscore_", "media": "video",
      "flux": "https://www.youtube.com/feeds/videos.xml?channel_id=UC…",
      "tags": ["tech"], "pourquoi": "veille tech FR, format long" },
    { "id": "thoughtworks", "titre": "Technology Podcast", "media": "audio",
      "flux": "https://…/feed.xml", "tags": ["archi", "tech"] }
  ]
}
```

- **Aucune clé d'API nulle part.** Une chaîne YouTube publie son Atom sur
  `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` (l'ID de chaîne, pas le
  `@handle` : il est dans le code source de la page de la chaîne, `channelId`) ; un
  podcast publie son RSS. C'est tout ce que le moteur sait lire, et c'est assez.
- `media` (`video` | `audio`) est une **déclaration**, pas une devinette : un flux qui
  porte des fichiers audio est classé audio quoi qu'il arrive.
- `tags` et `pourquoi` sont pour **toi** — ils voyagent avec chaque nouveauté et te
  disent pourquoi cette source était dans la liste le jour où elle a publié.

## Une fiche gardée — `veille/<slug>.md`

```markdown
---
title: Le moteur audio d'un synthé modulaire, expliqué
type: ecoute
media: video
url: https://www.youtube.com/watch?v=XXXXXXXXXXX
source: Underscore_
publie: 2026-08-27
duree: "18:42"
status: à voir
tags: [audio, synthese]
ico: 🎬
---

**Pourquoi ça vaut le coup** — une phrase, la tienne, pas celle de la description.

## Ce que ça apprend

- …
- …

## Les passages qui valent le détour

- [00:04:12](https://www.youtube.com/watch?v=XXXXXXXXXXX&t=252s) — la partie sur le
  filtre : *« … »*
- [00:11:38](https://www.youtube.com/watch?v=XXXXXXXXXXX&t=698s) — …

## Ce que j'en retiens
```

Les règles qui mordent :

- **`type: ecoute` est ce qui fait exister la fiche.** L'app ne lit rien d'autre ; le
  dossier `veille/` est une habitude, pas une obligation (une fiche rangée dans le
  domaine qui la concerne marche exactement pareil, et la tuile la montre quand même).
- **`url` est la clé.** C'est par elle que la file sait que cet épisode est déjà chez
  toi — et elle le sait quelle que soit l'orthographe du lien (`youtu.be/…`,
  `watch?v=…`, avec ou sans `utm_*`). Une fiche sans `url` est une fiche que la file
  reproposera indéfiniment.
- **`status`** suit le vocabulaire du cœur (voir `page-author`) : `à voir` tant que
  c'est en attente, `fait` une fois vu/écouté et dépouillé — ce mot-là **range** la
  fiche dans l'archive de l'écran. N'invente pas ta propre table : c'est le cœur qui
  décide ce qui est clos, et l'écran le lit.
- **`duree` est du texte** (`"18:42"`), `publie` une date ISO. Les deux viennent de
  l'outil, pas de ton estimation.
- **Ne colle jamais le transcript dans la page.** Il vit à côté (ci-dessous) ; la page
  porte ce que TU en tires. Une fiche de 4 000 lignes n'est pas une fiche.

## Ce qui a été dit — `veille/assets/<slug>.transcript.txt`

Un fichier texte, une ligne par phrase, horodatée :

```
[00:04:12] Le filtre passe-bas n'est pas là pour couper, il est là pour donner une couleur.
[00:04:31] Et c'est exactement ce que fait la résonance quand on la pousse trop loin.
```

C'est **greppable** (tes outils fichiers suffisent), diffable, lisible dans l'éditeur, et
ça survit à la désinstallation du plugin. À côté, `<slug>.media.json` garde ce que la
plateforme affirmait : titre, chaîne, durée, chapitres, description, langue des
sous-titres, date de transcription.

Les deux noms sont **dérivés du nom de la page** : renomme la fiche, renomme les deux
fichiers, sinon l'écran ne trouve plus le transcript (et le dit).

## L'outil

```sh
# `--pages` prend LES dossiers de la mémoire, séparés par des virgules : sans lui
# l'outil ne lit que `pages`, et il serait aveugle aux autres magasins.
node {{plugin_dir}}/tools/listening-post.mjs transcris <url> \
  --page veille/<slug>.md --pages <dossiers>
node {{plugin_dir}}/tools/listening-post.mjs cherche "moteur audio" [--n 8]
node {{plugin_dir}}/tools/listening-post.mjs flux [--jours 7]
node {{plugin_dir}}/tools/listening-post.mjs etat
```

- **`transcris`** récupère les sous-titres **publiés** (manuels d'abord, automatiques
  ensuite), les nettoie du défilement, les recolle en phrases et écrit les deux fichiers
  d'assets. Il **n'écrit jamais la page** — c'est ton travail, et c'est le seul endroit
  où il y a un jugement.
- **`cherche`** balaie tous les transcripts et rend les passages avec leur horodatage
  **et un lien qui ouvre le média à cette seconde**. C'est ce qu'on te demande quand on
  te dit « sors-moi l'extrait sur … ».
- **`flux`** rend ce que les sources ont publié récemment, moins ce qui est déjà classé.
  ⚠️ Il ne voit **pas** les « écartés » de l'écran (ils vivent dans le `dataDir`, hors
  de ta portée) : si on te dit qu'un truc avait été écarté, crois la personne.
- **`etat`** dit si le transcripteur est là et ce que pèse le corpus.

### Deux transcripteurs possibles — dis lequel tu as pris

L'outil ci-dessus a besoin de `yt-dlp` **sur l'instance**. Une instance peut à la
place (ou en plus) t'avoir donné les outils MCP **`verbatim`** du hub Rosetta —
`verbatim`, `verbatim_cherche`, `verbatim_fiche` — qui font le même travail côté
serveur, sans rien installer ici.

- **Si tu as `verbatim`**, sers-t'en : il rend les lignes déjà horodatées
  (`t`, `a`, `texte`, `lien`), par tranches (`depuis=<n>` pour la suite quand la
  réponse le dit). C'est **toi** qui écris ensuite
  `assets/<slug>.transcript.txt`, une ligne `[hh:mm:ss] texte` par ligne rendue,
  exactement le format ci-dessus — l'écran et la recherche ne lisent que ce
  fichier.
- **Sinon**, l'outil local fait tout d'un coup, fichiers compris.
- Pour répondre à « où a-t-il parlé de … ? » sur un média **pas encore gardé**,
  `verbatim_cherche` évite de faire passer une heure de parole dans la
  conversation. Sur le corpus **déjà gardé**, c'est `cherche` (ou un grep) qui
  répond, sans réseau.

⚠️ `verbatim` rend `origine` : `manuel` ou `auto`. **`auto` = reconnaissance
vocale** — ponctuation approximative, noms propres et chiffres écorchés.
Résumer, oui ; citer au mot près comme si l'auteur l'avait écrit, non. Quand une
fiche cite une piste automatique, dis-le dans la fiche.

### Quand il n'y a pas de transcript

Deux cas, et dans les deux la réponse est de **le dire**, jamais de combler :

1. **`yt-dlp` n'est pas installé** sur l'instance → `transcris` sort en erreur et
   l'explique, et l'écran affiche « pas de transcripteur local ». La veille continue de
   tourner (flux, file, fiches, recherche sur ce qui est déjà transcrit) ; c'est seulement
   l'extraction locale qui est absente — si tu as `verbatim`, elle ne l'est pas du tout,
   et l'écran ne peut pas le savoir : il ne voit que le binaire.
2. **Le média n'a pas de sous-titres publiés** — le cas courant des podcasts. L'outil
   écrit quand même `media.json` (description, chapitres) et te rend `transcript: null`
   avec la raison. Tu peux écrire la fiche à partir de la description et des chapitres,
   **à condition de le dire dans la fiche** : « fiche écrite depuis la description, pas
   depuis l'écoute ». Une note qui a l'air d'un dépouillement alors que personne n'a
   écouté est un mensonge qui dure des mois.

**Ne cite jamais un passage qui n'est pas dans le transcript**, et ne fabrique pas
d'horodatage : un lien qui tombe à côté est pire que pas de lien.

## Répondre à un besoin

C'est l'usage principal, et il n'y a **aucun classement** dans le produit — ni score, ni
file « recommandée ». L'écran montre ce qui est arrivé, du plus frais au plus vieux ;
la recommandation, c'est la conversation.

- « **Quoi de neuf dans la tech ?** » → `flux --jours 7`, filtre sur les `tags` des
  sources, et propose **trois** choses en disant pourquoi chacune, ce qu'elle coûte en
  temps (`duree`), et ce qu'on peut sauter. Dix liens listés par date, c'est ce que le
  lecteur de flux faisait déjà.
- « **Sors-moi l'extrait sur … ** » → `cherche`, puis rends le passage **et son lien
  horodaté**. Cite le transcript entre guillemets, pas ta reformulation.
- « **Ajoute ça à ma veille** » (un lien) → `transcris --page`, puis écris la fiche.
  Si la personne n'a rien demandé de plus, garde `status: à voir` : tu as dépouillé,
  tu n'as pas décidé à sa place que c'était vu.
- « **Résume-moi ça** » → le dépouillement, pas le résumé de la description. S'il n'y a
  pas de transcript, dis-le avant de résumer.

## Ce que l'écran fait, et que tu n'as pas à faire

Coller un lien, écarter une proposition, chercher dans un transcript, ouvrir la fiche
dans l'éditeur : tout ça se fait à l'écran, sans toi. Ses deux boutons ✦ **te parlent**
(ils écrivent dans le composer) — « ajoute ça à ma veille », « fais le point ». Quand
l'un d'eux arrive, c'est cette skill qui dit quoi faire.
