/**
 * The server's decisions, where the interesting ones are about the FRONTIER
 * between a queue and a library: what a candidate is allowed to be, what
 * disappears from the queue because it is already filed, and what a pasted
 * link is worth before anybody has looked at it.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { buildQueue, makeCache, resolveLink } from '../api.mjs'

const entry = (over = {}) => ({
  key: 'yt:AAA',
  url: 'https://www.youtube.com/watch?v=AAA',
  titre: 'Le moteur audio',
  publie: '2026-08-27T00:00:00.000Z',
  resume: '',
  secondes: 1122,
  media: 'video',
  source: 'Underscore_',
  sourceId: 'underscore',
  tags: ['tech'],
  ...over,
})

test('the queue is what arrived, freshest first, with a readable duration', () => {
  const items = buildQueue({
    entries: [entry(), entry({ key: 'yt:BBB', titre: 'Plus vieux', publie: '2026-08-01T00:00:00.000Z' })],
  })
  assert.deepEqual(items.map((item) => item.titre), ['Le moteur audio', 'Plus vieux'])
  assert.equal(items[0].duree, '18:42')
  assert.equal(items[0].origine, 'flux')
})

test('what is already filed never comes back, however the link was spelled', () => {
  const items = buildQueue({
    entries: [entry()],
    // The library keyed a `youtu.be` link; the feed publishes `watch?v=`.
    library: [{ key: 'yt:AAA', path: 'veille/moteur-audio.md' }],
  })
  assert.deepEqual(items, [])
})

test('what was waved away stays away', () => {
  const items = buildQueue({ entries: [entry()], dismissed: { 'yt:AAA': { ts: 'x' } } })
  assert.deepEqual(items, [])
})

test('a pasted link outranks the same link arriving through a feed', () => {
  const [item] = buildQueue({
    entries: [entry()],
    dropped: { 'yt:AAA': { url: 'https://youtu.be/AAA', titre: 'collé à la main', note: 'pour le filtre', ts: 'x' } },
  })
  assert.equal(item.origine, 'depose')
  assert.equal(item.titre, 'collé à la main')
  assert.equal(item.note, 'pour le filtre')
  // …and what only the feed knew is not thrown away with it.
  assert.equal(item.duree, '18:42')
  assert.equal(item.source, 'Underscore_')
})

test('a pasted link that is already filed is not offered either', () => {
  const items = buildQueue({
    dropped: { 'yt:AAA': { url: 'https://youtu.be/AAA', ts: 'x' } },
    library: [{ key: 'yt:AAA' }],
  })
  assert.deepEqual(items, [])
})

test('a link resolves through oEmbed, and keeps its channel', async () => {
  const answers = {
    'https://www.youtube.com/oembed': {
      ok: true,
      json: async () => ({ title: 'Le moteur audio', author_name: 'Underscore_' }),
    },
  }
  const resolved = await resolveLink('https://youtu.be/AAA', async (url) => {
    const key = String(url).split('?')[0]
    return answers[key] ?? { ok: false }
  })
  assert.deepEqual(resolved, {
    url: 'https://youtu.be/AAA',
    titre: 'Le moteur audio',
    source: 'Underscore_',
    media: 'video',
  })
})

test('a link nobody answers for is still queueable, under its own URL', async () => {
  const resolved = await resolveLink('https://youtu.be/AAA', async () => {
    throw new Error('offline')
  })
  assert.equal(resolved.titre, 'https://youtu.be/AAA')
  assert.equal(resolved.media, 'video')
})

test('an ordinary page gives up its title, and an audio file says it is audio', async () => {
  const page = await resolveLink('https://exemple.fr/article', async () => ({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => '<html><head><title>  Un\n article </title></head></html>',
  }))
  assert.equal(page.titre, 'Un article')
  assert.equal(page.source, 'exemple.fr')

  const sound = await resolveLink('https://exemple.fr/12.mp3', async () => ({
    ok: true,
    headers: { get: () => 'audio/mpeg' },
  }))
  assert.equal(sound.media, 'audio')
})

test('a cached feed answer expires rather than standing forever', () => {
  const cache = makeCache()
  cache.set('feed', 0, 'vieux')
  assert.equal(cache.get('feed'), undefined)
  cache.set('feed', 10_000, 'frais')
  assert.equal(cache.get('feed'), 'frais')
})
