/**
 * The atelier speaks English and French, and French has not moved.
 *
 * `hub-fr.txt` is the text the engine rendered BEFORE it had a words table —
 * the hub, a seeded bench on every station, the two sheets, the bench mode,
 * the edit mode, the failures — captured from the code as it stood. The French
 * run must reproduce it word for word: a French instance reads what it always
 * read (B-1). The English run must say nothing French of its own.
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { LISTING, WORKBOOK, tour, transcript } from './render.js'
import view from '../web/view.js'
import { table } from '../web/words.js'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..', 'web')

const ACCENTED = /[À-ÖØ-öø-ÿŒœ]/u
const FRENCH_WORDS = /(?<![\p{L}\p{N}_])(?:le|la|les|des|du|pour|avec|une|un)(?![\p{L}\p{N}_])/iu

/** Every string the user "wrote" in the seeded bench and listing. */
function seeded() {
  const found = []
  const walk = (value) => {
    if (typeof value === 'string') found.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk(WORKBOOK)
  walk(LISTING)
  return found
}

test('in French, the engine says what it said before the table', async () => {
  const before = readFileSync(join(here, 'hub-fr.txt'), 'utf8')
  const now = transcript(await tour({ locale: 'fr' }))
  assert.equal(now, before)
})

test('in English, the engine says nothing French outside what the user wrote', async () => {
  // What the user wrote is theirs to write in any language: it is taken out
  // before looking, the strings that would trip the check and no others.
  const theirs = seeded()
    .filter((text) => ACCENTED.test(text) || FRENCH_WORDS.test(text))
    .sort((a, b) => b.length - a.length)
  const parts = await tour({ locale: 'en' })
  const faults = []
  for (const [name, text] of parts) {
    let rest = text
    for (const own of theirs) rest = rest.split(own).join(' ')
    for (const line of rest.split('\n')) {
      if (ACCENTED.test(line) || FRENCH_WORDS.test(line)) faults.push(`${name}: ${line}`)
    }
  }
  assert.deepEqual(faults, [])
})

test('in English, no French sentence of the table is said', async () => {
  const french = Object.entries(table('fr'))
    .filter(([key, value]) => value !== key && !/[%<]/.test(value) && value.length > 4)
    .map(([, value]) => value)
  // The vocabulary of the data ('rive-avant') is the user's, not the engine's.
  const theirs = seeded().filter((text) => text.length > 3).sort((a, b) => b.length - a.length)
  let all = (await tour({ locale: 'en' })).map(([, text]) => text).join('\n')
  for (const own of theirs) all = all.split(own).join(' ')
  assert.deepEqual(french.filter((value) => all.includes(value)), [])
})

test('the code that runs carries no French literal', () => {
  for (const name of ['app.js', 'view.js']) {
    const code = readFileSync(join(web, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    const lines = code.split('\n').filter((line) => ACCENTED.test(line))
    assert.deepEqual(lines, [], `${name} has French outside its table`)
    assert.ok(!/\bvalide\b/.test(code), `${name} must not import the rules' messages`)
  }
})

test('the view hands its table to the shell, in the reader\'s language', () => {
  const api = (locale) => ({
    id: 'atelier',
    base: '/plugins/atelier/',
    locale,
    fetch: () => Promise.reject(new Error('offline')),
    ask() {},
    compose() {},
    trail() {},
  })
  assert.deepEqual(view(api('fr')).words, table('fr'))
  assert.deepEqual(view(api('en')).words, {})
})

test('the table says vous', () => {
  const familiar = Object.values(table('fr')).filter((value) => /(?<![\p{L}\p{N}_])(?:tu|te|ton|ta|tes|toi)(?![\p{L}\p{N}_])/iu.test(value))
  assert.deepEqual(familiar, [])
})
