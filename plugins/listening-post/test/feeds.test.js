/**
 * Reading the two dialects, and the one thing that matters more than either:
 * that the SAME media, spelled four ways, is one entry.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { byFreshness, clockOf, deepLink, keyOf, parseFeed, secondsOf, whenOf } from '../lib/feeds.mjs'

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Underscore_</title>
  <entry>
    <id>yt:video:AAAAAAAAAAA</id>
    <yt:videoId>AAAAAAAAAAA</yt:videoId>
    <title>Le moteur audio, expliqué</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAAA"/>
    <published>2026-08-27T17:00:03+00:00</published>
    <media:group>
      <media:description>On ouvre le capot &amp; on regarde.</media:description>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:BBBBBBBBBBB</id>
    <title>Un autre sujet</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=BBBBBBBBBBB"/>
    <published>2026-08-20T09:00:00+00:00</published>
  </entry>
</feed>`

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Le podcast</title>
    <item>
      <title><![CDATA[Épisode 12 — la synthèse]]></title>
      <link>https://exemple.fr/episodes/12</link>
      <pubDate>Wed, 27 Aug 2026 06:00:00 +0000</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <description>Ce qu'on raconte.</description>
      <enclosure url="https://exemple.fr/12.mp3" type="audio/mpeg" length="1"/>
      <podcast:transcript url="https://exemple.fr/12.vtt" type="text/vtt"/>
    </item>
  </channel>
</rss>`

test('an Atom feed gives its entries, newest ones intact', () => {
  const entries = parseFeed(ATOM, { id: 'underscore', titre: 'Underscore_', media: 'video', tags: ['tech'] })
  assert.equal(entries.length, 2)
  assert.equal(entries[0].titre, 'Le moteur audio, expliqué')
  assert.equal(entries[0].url, 'https://www.youtube.com/watch?v=AAAAAAAAAAA')
  assert.equal(entries[0].key, 'yt:AAAAAAAAAAA')
  assert.equal(entries[0].media, 'video')
  assert.equal(entries[0].source, 'Underscore_')
  assert.deepEqual(entries[0].tags, ['tech'])
  // Entities are decoded, never left as markup on a card.
  assert.match(entries[0].resume, /capot & on regarde/)
})

test('an RSS item is audio because its enclosure is, whatever was declared', () => {
  const [entry] = parseFeed(RSS, { id: 'pod', titre: 'Le podcast', media: 'video' })
  assert.equal(entry.media, 'audio')
  assert.equal(entry.titre, 'Épisode 12 — la synthèse')
  assert.equal(entry.secondes, 3723)
  assert.equal(entry.transcript, 'https://exemple.fr/12.vtt')
  assert.equal(entry.publie, '2026-08-27T06:00:00.000Z')
})

test('a feed that is not a feed is no entries, not a crash', () => {
  assert.deepEqual(parseFeed('<html><body>nope</body></html>'), [])
  assert.deepEqual(parseFeed(''), [])
  assert.deepEqual(parseFeed(undefined), [])
})

test('the same video, spelled four ways, is one key', () => {
  const key = 'yt:AAAAAAAAAAA'
  assert.equal(keyOf('https://www.youtube.com/watch?v=AAAAAAAAAAA'), key)
  assert.equal(keyOf('https://youtube.com/watch?v=AAAAAAAAAAA&utm_source=newsletter'), key)
  assert.equal(keyOf('https://youtu.be/AAAAAAAAAAA?si=xyz'), key)
  assert.equal(keyOf('https://m.youtube.com/watch?v=AAAAAAAAAAA&t=42s'), key)
})

test('an ordinary link keys on what it points at, minus the tracking', () => {
  const bare = keyOf('https://exemple.fr/episodes/12')
  assert.equal(keyOf('https://www.exemple.fr/episodes/12/?utm_campaign=x'), bare)
  assert.notEqual(keyOf('https://exemple.fr/episodes/13'), bare)
  assert.equal(keyOf(''), null)
})

test('a timestamp becomes a link that seeks', () => {
  assert.equal(
    deepLink('https://www.youtube.com/watch?v=A', 754),
    'https://www.youtube.com/watch?v=A&t=754s',
  )
  assert.equal(deepLink('https://exemple.fr/12.mp3', 90), 'https://exemple.fr/12.mp3#t=90')
  // Second zero is the start of the media: a link with nothing to seek to.
  assert.equal(deepLink('https://exemple.fr/12.mp3', 0), 'https://exemple.fr/12.mp3')
})

test('durations read whatever a feed writes, and are shown as a clock', () => {
  assert.equal(secondsOf('01:02:03'), 3723)
  assert.equal(secondsOf('22:10'), 1330)
  assert.equal(secondsOf('900'), 900)
  assert.equal(secondsOf('bientôt'), null)
  assert.equal(clockOf(3723), '1:02:03')
  assert.equal(clockOf(1330), '22:10')
  assert.equal(clockOf(0), null)
})

test('an unreadable date is absent, never today', () => {
  assert.equal(whenOf('la semaine dernière'), null)
  // …and absence sorts LAST, so it never crowns a queue sorted by freshness.
  const sorted = [
    { publie: null, titre: 'sans date' },
    { publie: '2026-08-20T00:00:00.000Z', titre: 'vieux' },
    { publie: '2026-08-27T00:00:00.000Z', titre: 'frais' },
  ].sort(byFreshness)
  assert.deepEqual(sorted.map((entry) => entry.titre), ['frais', 'vieux', 'sans date'])
})
