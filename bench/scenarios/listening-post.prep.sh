#!/bin/sh
# What the `listening-post` scenario needs before the image boots: a workspace
# holding two kept items with their transcripts, and two feeds to pull from.
#
# The feeds are FILES, served back by the instance's own `/api/files` — which
# is what makes this run deterministic and offline. Pointing a source at a real
# channel would photograph whatever YouTube published this morning, and would
# fail entirely on a machine with no way out; pointing it at the workspace
# exercises the same code path (fetch, parse, dedupe, drop what is filed)
# against bytes this file wrote.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
pages="$stage/workspace/pages/veille"
mkdir -p "$pages/assets"

# ── the sources, and the feeds they name ───────────────────────────────────
cat >"$pages/assets/veille.json" <<'JSON'
{
  "version": 1,
  "sources": [
    { "id": "underscore", "titre": "Underscore_", "media": "video",
      "flux": "http://127.0.0.1:8730/api/files/veille/assets/underscore.xml",
      "tags": ["tech"], "pourquoi": "veille tech FR, format long" },
    { "id": "atelier-son", "titre": "L'Atelier du son", "media": "audio",
      "flux": "http://127.0.0.1:8730/api/files/veille/assets/atelier-son.xml",
      "tags": ["audio"] }
  ]
}
JSON

cat >"$pages/assets/underscore.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Underscore_</title>
  <entry>
    <id>yt:video:BBBBBBBBBBB</id>
    <title>Pourquoi vos plugins audio sonnent tous pareil</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=BBBBBBBBBBB"/>
    <published>2026-08-30T17:00:00+00:00</published>
    <media:group><media:description>Trente ans de filtres copiés les uns sur les autres, et ce que ça a coûté.</media:description></media:group>
  </entry>
  <entry>
    <id>yt:video:CCCCCCCCCCC</id>
    <title>On a démonté un synthé de 1978</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=CCCCCCCCCCC"/>
    <published>2026-08-24T09:30:00+00:00</published>
    <media:group><media:description>Chaque carte, une fonction. Rien de logiciel nulle part.</media:description></media:group>
  </entry>
  <entry>
    <id>yt:video:AAAAAAAAAAA</id>
    <title>Le moteur audio d'un synthé modulaire, expliqué</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAAA"/>
    <published>2026-08-27T17:00:00+00:00</published>
  </entry>
</feed>
XML

# The third entry above is already filed below, under its `youtu.be` spelling:
# the queue has to drop it without anybody saying the two links are the same.
cat >"$pages/assets/atelier-son.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>L'Atelier du son</title>
    <item>
      <title><![CDATA[Épisode 47 — l'oreille et la compression]]></title>
      <link>https://atelier-du-son.example/47</link>
      <pubDate>Fri, 29 Aug 2026 06:00:00 +0000</pubDate>
      <itunes:duration>00:52:10</itunes:duration>
      <description>Ce que l'oreille pardonne, et ce qu'elle n'a jamais pardonné.</description>
      <enclosure url="https://atelier-du-son.example/47.mp3" type="audio/mpeg" length="1"/>
    </item>
  </channel>
</rss>
XML

# ── two items already kept, one of them done ───────────────────────────────
cat >"$pages/moteur-audio.md" <<'MD'
---
title: Le moteur audio d'un synthé modulaire, expliqué
type: ecoute
media: video
url: https://youtu.be/AAAAAAAAAAA
source: Underscore_
publie: 2026-08-27
duree: "18:42"
status: à voir
tags: [audio, synthese]
ico: 🎬
---

**Pourquoi ça vaut le coup** — la seule explication du filtre qui parle de
couleur avant de parler de coupure.

## Ce que ça apprend

- Un passe-bas ne sert pas à retirer, il sert à teindre.
- La résonance est ce qui fait chanter un filtre, et ce qui le fait hurler.
MD

cat >"$pages/assets/moteur-audio.transcript.txt" <<'TXT'
[00:00:07] On commence par le seul bloc que tout le monde croit connaître : le filtre passe-bas.
[00:00:41] Le filtre passe-bas n'est pas là pour couper, il est là pour donner une couleur au son.
[00:01:23] Ce qu'on entend comme de la chaleur, c'est très souvent une pente douce et rien d'autre.
[00:02:58] La résonance, elle, remonte les fréquences juste avant la coupure, et ça s'entend tout de suite.
[00:04:12] Poussée assez loin, la résonance fait osciller le filtre tout seul : il devient sa propre source.
[00:06:30] C'est là que les modèles numériques se séparent des analogiques, et pas ailleurs.
[00:08:05] Un filtre qui sature quand on le pousse, c'est un filtre qui a un caractère.
[00:11:38] La plupart des plugins évitent la saturation, et c'est pour ça qu'ils sonnent tous pareil.
[00:14:02] Le deuxième bloc, l'enveloppe, décide de tout ce que le filtre va raconter dans le temps.
[00:16:20] Une attaque de dix millisecondes et une attaque de cinquante ne jouent pas le même instrument.
[00:18:01] Si vous ne retenez qu'une chose : réglez le filtre à l'oreille, jamais à l'écran.
TXT

cat >"$pages/casque-ouvert.md" <<'MD'
---
title: Casque ouvert ou fermé — le match, vraiment
type: ecoute
media: audio
url: https://atelier-du-son.example/44
source: L'Atelier du son
publie: 2026-08-12
duree: "41:05"
status: fait
tags: [audio, materiel]
ico: 🎧
---

Écouté. Rien de neuf sur le fond, mais le passage sur la fatigue auditive
valait le détour.
MD

cat >"$pages/assets/casque-ouvert.transcript.txt" <<'TXT'
[00:03:40] Un casque fermé ne vous isole pas du bruit, il vous isole de la pièce.
[00:12:15] La fatigue auditive ne vient presque jamais du volume, elle vient de la durée.
[00:29:50] Sur un mixage, la résonance d'un casque fermé vous fera creuser un grave qui n'existe pas.
TXT

# ── the instance ───────────────────────────────────────────────────────────
cat >"$stage/adestia.config.yaml" <<'YAML'
name: Veille
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  apps: [listening-post]
  skin: default
YAML

# The container runs as `node`, not as whoever ran the bench: the workspace is
# written into, not only read, so it is opened rather than merely readable.
chmod -R a+rwX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$stage/workspace:/workspace"
