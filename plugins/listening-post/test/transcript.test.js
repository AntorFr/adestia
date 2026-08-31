/**
 * The rolling window, which is the whole difficulty of a caption file, and
 * the search that only means anything once the roll is gone.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  formatTranscript,
  fold,
  parseCaptions,
  parseTranscript,
  search,
  toSeconds,
  toStamp,
} from '../lib/transcript.mjs'

/** YouTube's automatic captions: each cue repeats most of the one before. */
const ROLLING = `WEBVTT
Kind: captions
Language: fr

00:00:01.199 --> 00:00:03.629 align:start position:0%
le filtre passe-bas n'est pas là

00:00:03.629 --> 00:00:06.100 align:start position:0%
le filtre passe-bas n'est pas là pour couper

00:00:06.100 --> 00:00:09.000 align:start position:0%
pour couper il est là pour donner une couleur. Et c'est exactement ce que fait la résonance quand on la pousse.

00:02:00.000 --> 00:02:04.000
<c>Le</c> deuxième sujet commence ici et parle de tout autre chose, longuement, avec des mots.
`

test('the roll is unrolled: each cue keeps only what it adds', () => {
  const lines = parseCaptions(ROLLING, { chunk: 60 })
  const whole = lines.map((line) => line.text).join(' ')
  assert.equal(whole.match(/passe-bas/g).length, 1, 'the repeated words are said once')
  assert.match(whole, /pour couper il est là pour donner une couleur/)
  assert.equal(lines[0].t, 1, 'a chunk is timed at the moment it STARTS')
})

test('captions are glued back into sentences, not left as fragments', () => {
  const lines = parseCaptions(ROLLING, { chunk: 60 })
  assert.ok(lines.length >= 2 && lines.length <= 4, `got ${lines.length} lines`)
  assert.ok(lines.every((line) => line.text.length > 20))
})

test('markup, entities and cue numbers never reach the transcript', () => {
  const lines = parseCaptions(ROLLING)
  const whole = lines.map((line) => line.text).join(' ')
  assert.ok(!whole.includes('<c>'))
  assert.ok(!whole.includes('align:start'))
  assert.ok(!whole.includes('WEBVTT'))
})

test('a transcript survives a round trip through its own file format', () => {
  const lines = parseCaptions(ROLLING, { chunk: 60 })
  const back = parseTranscript(formatTranscript(lines))
  assert.deepEqual(back, lines)
})

test('a wrapped line belongs to the stamp above it', () => {
  const lines = parseTranscript('[00:01:00] une phrase\ncoupée en deux\n[00:02:00] la suivante\n')
  assert.deepEqual(lines, [
    { t: 60, text: 'une phrase coupée en deux' },
    { t: 120, text: 'la suivante' },
  ])
})

test('stamps read and write the same seconds', () => {
  assert.equal(toSeconds('01:02:03.400'), 3723)
  assert.equal(toSeconds('02:03.400'), 123)
  assert.equal(toStamp(3723), '01:02:03')
  assert.equal(toStamp(0), '00:00:00')
})

test('accents are not a wall between a French keyboard and a French corpus', () => {
  assert.equal(fold('Résonance ÉCOUTÉ'), 'resonance ecoute')
})

const CORPUS = [
  { t: 0, text: "On commence par la synthèse soustractive et son filtre." },
  { t: 30, text: 'La résonance pousse le filtre à osciller tout seul.' },
  { t: 300, text: "Rien à voir : ici on parle de la sortie casque et du niveau." },
  { t: 900, text: 'On revient au filtre, et à la résonance, pour finir.' },
]

test('search says where the words are, in the order they were said', () => {
  const hits = search(CORPUS, 'filtre résonance')
  assert.ok(hits.length >= 2)
  assert.deepEqual(
    hits.map((hit) => hit.t),
    [...hits.map((hit) => hit.t)].sort((a, b) => a - b),
    'passages come back in the order of the media',
  )
  assert.ok(hits.some((hit) => hit.t === 900))
})

test('overlapping windows describe one passage, not three', () => {
  const hits = search(CORPUS, 'filtre')
  const close = hits.filter((hit) => hit.t < 60)
  assert.equal(close.length, 1)
})

test('a query with nothing to go on finds nothing rather than everything', () => {
  assert.deepEqual(search(CORPUS, 'de la'), [])
  assert.deepEqual(search([], 'filtre'), [])
})
