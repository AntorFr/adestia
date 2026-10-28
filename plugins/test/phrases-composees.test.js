/**
 * A closed inventory of the sentences a plugin ASSEMBLES around a translation.
 *
 * `t('key') + ' of the route'` or `${t('key')} pieces` puts an English word
 * outside every table: the French instance reads half a sentence in English,
 * or an `s` glued on a word that does not plural that way (« 1 pièces »). The
 * sentence belongs in the table whole, with its placeholders.
 *
 * The test reads every JS file of a plugin's `web` folder as a syntax tree and finds each
 * template or `+` that mixes a call to a translator with a literal carrying
 * letters — markup, entities and `%placeholders` taken out first. What it finds
 * must be in ALLOWED below, each with its reason; an occurrence outside the list
 * fails, and so does an entry that no longer matches anything.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// The functions that turn a key into the reader's words.
const SAYERS = new Set(['t', 'tr', 'plural', 'counted', 'piecesText'])

// "<plugin>/web/<file>: <letters found beside the call>" → why it is not a sentence to translate.
const ALLOWED = {
  'atelier/web/app.js: mm': 'the unit of a dimension (len × wid mm), not a word of the language',
}

const bare = (text) => text.replace(/<[^>]*>/g, ' ').replace(/\u0001/g, ' ').replace(/&#?\w+;/g, ' ').replace(/%\w+/g, ' ')
const words = (text) => bare(text).match(/\p{L}+/gu) ?? []

function callsSayer(node) {
  let found = false
  const walk = (child) => {
    if (ts.isCallExpression(child)) {
      const fn = child.expression
      const name = ts.isIdentifier(fn) ? fn.text : ts.isPropertyAccessExpression(fn) ? fn.name.text : ''
      if (SAYERS.has(name)) found = true
    }
    ts.forEachChild(child, walk)
  }
  walk(node)
  return found
}

/** The literals an operand can evaluate to: through parentheses and both branches of a condition. */
function literalsOf(node) {
  if (ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isParenthesizedExpression(node)) return literalsOf(node.expression)
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)]
  return []
}

/** The letters a file puts beside a translator call, by `plugin/web/file: word word`. */
export function composed(source, name = 'x.js') {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = new Set()
  const note = (list) => { if (list.length) found.add([...new Set(list)].sort().join(' ')) }
  const visit = (node) => {
    if (ts.isTemplateExpression(node) && node.templateSpans.some((s) => callsSayer(s.expression))) {
      // Joined first: a tag's attributes run across the `${…}` that interrupt them.
      note(words([node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('\u0001')))
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const sides = [node.left, node.right]
      if (sides.some(callsSayer)) for (const s of sides) note(literalsOf(s).flatMap(words))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return [...found]
}

test('the survey sees what it is meant to see', () => {
  assert.deepEqual(composed("x = `${t('a')} pieces`"), ['pieces'])
  assert.deepEqual(composed("x = t('a') + 's'"), ['s'])
  assert.deepEqual(composed("x = `<b>${t('a')}</b> &nbsp; %n`"), [])
  assert.deepEqual(composed("x = `${esc(a)} pieces`"), [])
  assert.deepEqual(composed("x = t(k) + (n > 1 && ok ? 's' : '')"), ['s'])
  assert.deepEqual(composed("x = 'p ' + t('a', { n }) + ' of'"), ['of', 'p'])
})

test('no plugin screen assembles a sentence around a translation', () => {
  const found = []
  let files = 0
  for (const plugin of readdirSync(root).sort()) {
    const dir = join(root, plugin, 'web')
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
      files += 1
      for (const hit of composed(readFileSync(join(dir, file), 'utf8'), file)) found.push(`${plugin}/web/${file}: ${hit}`)
    }
  }
  assert.ok(files > 20, `only ${files} files read: the survey lost its input`)
  const outside = found.filter((hit) => !(hit in ALLOWED))
  assert.deepEqual(outside, [], `a sentence is assembled around a translation; give it a whole table entry:\n${outside.join('\n')}`)
  const useless = Object.keys(ALLOWED).filter((key) => !found.includes(key))
  assert.deepEqual(useless, [], `allowed entries that match nothing any more:\n${useless.join('\n')}`)
})
