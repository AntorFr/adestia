/**
 * AD-24 d: a plugin draws no emoji of its own beside a word; the charter's
 * closed icon list or the bare word does that. Emoji that are DATA stay, file by
 * file, in KEPT below (an author's or engine's `ico`, trip item/travel/weather
 * types, journal and media-type fallbacks, the route card's mountain).
 * The scan reads string and template literals only (comments are free) and
 * ignores typographic glyphs (✦ ✓ arrows, © ®), which are not emoji.
 * The test fails on an emoji absent from KEPT and on a KEPT entry no longer used.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Pictographs, minus the sign marks that are typography (© ®), minus keycap/ZWJ/VS plumbing.
const PICTO = /\p{Extended_Pictographic}/gu
const TYPOGRAPHY = new Set(['©', '®', '™', '▶', '◀', '↗', '↩'])

/** file (relative to repo) → emoji kept as data. */
const KEPT = {
  'plugins/journal/web/app.js': ['📓'],
  'plugins/listening-post/web/app.js': ['🎧', '🎬'],
  'plugins/listening-post/web/model.js': ['🎧', '🎬'],
  'plugins/parcours/web/carte.js': ['⛰'],
  'plugins/todo/web/model.js': ['📋'],
  // trip item types, travel modes, weather: all keyed data tables
  'plugins/voyages/web/app.js': ['🏠', '🍽', '🚣', '🏛', '🧭', '🚶', '🚗', '🚲', '🚇', '☀', '🌤', '⛅', '🌥', '☁', '💨', '🌫', '⛈', '🌧', '🌨'],
}

function webFiles() {
  const out = []
  for (const plugin of readdirSync(join(root, 'plugins'), { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue
    const dir = join(root, 'plugins', plugin.name, 'web')
    let names
    try { names = readdirSync(dir) } catch { continue }
    for (const n of names) if (/\.(m?js)$/.test(n)) out.push(join(dir, n))
  }
  return out.sort()
}

function literals(file) {
  const src = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = []
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

function emojiOf(file) {
  const set = new Set()
  for (const text of literals(file)) for (const m of text.matchAll(PICTO)) if (!TYPOGRAPHY.has(m[0])) set.add(m[0])
  return set
}

test('plugin chrome literals carry no emoji beyond the per-file data allow-list', () => {
  const bad = []
  for (const file of webFiles()) {
    const rel = relative(root, file)
    const allowed = new Set(KEPT[rel] ?? [])
    for (const e of emojiOf(file)) {
      if (allowed.has(e)) continue
      bad.push(`${rel}: ${e} (U+${e.codePointAt(0).toString(16)})`)
    }
  }
  assert.deepEqual(bad, [])
})

test('every allow-list entry is still used by its file', () => {
  const stale = []
  const files = new Set(webFiles().map((f) => relative(root, f)))
  for (const [rel, list] of Object.entries(KEPT)) {
    if (!list) continue
    assert.ok(files.has(rel), `${rel} no longer exists`)
    const have = emojiOf(join(root, rel))
    for (const e of list) if (!have.has(e)) stale.push(`${rel}: ${e}`)
  }
  assert.deepEqual(stale, [])
})

test('removed chrome companions never come back, in any plugin', () => {
  const chrome = ['🖐', '📄', '📝', '📎', '🗄', '⚠', '🎉', '🌴', '💡', '📧', '📍', '🎩', '🗓', '🥾', '☑', '🔥', '📅', '📥', '🌱']
  const back = []
  for (const file of webFiles()) {
    const have = emojiOf(file)
    for (const e of chrome) if (have.has(e)) back.push(`${relative(root, file)}: ${e}`)
  }
  assert.deepEqual(back, [])
})
