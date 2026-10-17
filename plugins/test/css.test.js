/**
 * Plugins read the shell's tokens by name. A parameter may name a hue or a
 * derived mix, but may not alias a semantic token. Literal colours belong
 * only in var() fallbacks; radii and font sizes use the shell's steps.
 * Removing an outline requires a replacement 2px ring in the same rule.
 *
 * Each migrated plugin adds its name on its own line, alphabetically. The
 * final tranche checks coverage; an empty list is intentional at the start.
 * To exercise this gate with a bad sheet:
 * PLUGIN_CSS_FIXTURE=plugins/test/fixtures/alias.css node --test plugins/test/css.test.js
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHECKED = [
  'journal',
  'listening-post',
  'parcours',
  'planif',
  'project-management',
  'scan',
]
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
const tokens = new Set([...withoutComments(readFileSync(join(root, 'packages/web/src/app/tokens.css'), 'utf8'))
  .matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))

/** Balanced calls: a fallback may contain another var(), colour or mix. */
function variables(value) {
  const calls = []
  for (const match of value.matchAll(/\bvar\(\s*(--[\w-]+)/g)) {
    let depth = 1
    let comma = -1
    let end = match.index + match[0].length
    let quote = ''
    for (; end < value.length; end += 1) {
      const c = value[end]
      if (c === '\\') { end += 1; continue }
      if (quote) { if (c === quote) quote = ''; continue }
      if (c === '"' || c === "'") { quote = c; continue }
      if (c === '(') depth += 1
      if (c === ')' && --depth === 0) break
      if (c === ',' && depth === 1 && comma === -1) comma = end
    }
    calls.push({ token: match[1], start: match.index, end: end + 1, comma })
  }
  return calls
}

/** Keep each rule's own declarations, including parents of nested CSS rules. */
function rulesOf(source) {
  const stack = []
  const rules = []
  let quote = ''
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    if (c === '\\') { i += 1; continue }
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '{') {
      const parent = stack.at(-1)
      if (parent) parent.segments.push([parent.cursor, i])
      stack.push({ cursor: i + 1, segments: [] })
    } else if (c === '}' && stack.length) {
      const rule = stack.pop()
      rule.segments.push([rule.cursor, i])
      rules.push(rule.segments.flatMap(([start, end]) =>
        [...source.slice(start, end).matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)]
          .map((match) => ({ property: match[1], raw: match[2], offset: start + match.index }))))
      if (stack.length) stack.at(-1).cursor = i + 1
    }
  }
  return rules
}

function faults(file) {
  const source = withoutComments(readFileSync(file, 'utf8'))
  const parameters = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  const errors = []
  const report = (index, message) => errors.push(`${relative(root, file)}:${source.slice(0, index).split('\n').length}: ${message}`)
  for (const declarations of rulesOf(source)) {
    const ring = declarations.some((d) => d.property === 'box-shadow' && /(?:^|,)\s*(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+2px(?:\s|$)/.test(d.raw))
    for (const { property, raw, offset } of declarations) {
      const value = raw.replace(/\s*!important\s*$/, '').trim()
      const calls = variables(value)
      for (const call of calls) {
        if (call.comma === -1 && !tokens.has(call.token) && !parameters.has(call.token)) report(offset, `undefined token ${call.token}`)
      }
      if (property.startsWith('--') && calls.some((c) => c.start === 0 && c.end === value.length && tokens.has(c.token) && !c.token.startsWith('--adestia-hue-'))) report(offset, `alias ${property}: ${value}`)
      for (const colour of value.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi)) {
        if (!calls.some((c) => c.comma !== -1 && colour.index > c.comma && colour.index < c.end)) report(offset, `literal colour ${colour[0]}`)
      }
      if (/\b999px\b/i.test(value)) report(offset, '999px: use --radius-pill')
      if (property === 'outline' && /^none$/i.test(value) && !ring) report(offset, 'outline: none without a replacement 2px ring')
      if (property === 'font-size') {
        const outside = value.replace(/\bvar\(\s*--[\w-]+\s*(?:,|\))/g, ' ')
        if (/(?:^|[^\w-])\d*\.?\d+(?:[a-z%]+)?/i.test(outside)) report(offset, `literal font-size ${value}`)
      }
    }
  }
  return errors
}

const sheets = CHECKED.flatMap((id) => {
  const web = join(root, 'plugins', id, 'web')
  return readdirSync(web).filter((name) => name.endsWith('.css')).map((name) => join(web, name))
})
if (process.env.PLUGIN_CSS_FIXTURE) sheets.push(resolve(process.env.PLUGIN_CSS_FIXTURE))

test('plugin styles keep the shell token contract', () => {
  const errors = sheets.flatMap(faults)
  assert.deepEqual(errors, [], errors.join('\n'))
})
