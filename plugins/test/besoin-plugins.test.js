/**
 * Exit criterion of the plugins tranche, written from the need (B-8, B-9, R-7, R-8) and not from
 * the code: what `git grep` must no longer find in the plugins, and the register of the French.
 * Every forbidden name is spelled out here by hand, from docs/ecrans.md § Tokens.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const plugins = readdirSync(join(root, 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(root, 'plugins', e.name, 'adestia-plugin.json'))).map((e) => e.name)

const stylesheets = plugins.flatMap((id) => {
  const dir = join(root, 'plugins', id, 'web')
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => join(dir, f)) : []
})
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

/** The text with every `var( … )` removed, so what is left is what the sheet writes outside a fallback. */
function withoutVars(css) {
  let out = ''
  for (let i = 0; i < css.length; i += 1) {
    if (css.startsWith('var(', i)) {
      let depth = 0
      let j = i + 3
      for (; j < css.length; j += 1) {
        if (css[j] === '(') depth += 1
        else if (css[j] === ')') { depth -= 1; if (depth === 0) break }
      }
      out += css.slice(i, i + 4).replace(/./g, ' ') + css.slice(i + 4, j + 1).replace(/[^\n]/g, ' ')
      i = j
    } else out += css[i]
  }
  return out
}
const lineOf = (text, index) => text.slice(0, index).split('\n').length
const hit = (file, text, index, what) => `${relative(root, file)}:${lineOf(text, index)}: ${what}`

test('there are plugin stylesheets to check', () => {
  assert.ok(stylesheets.length >= 8, `found ${stylesheets.length}`)
})

test('no plugin stylesheet keeps a second token vocabulary (alias names, defined or used)', () => {
  const aliases = ['ink', 'ink-soft', 'ink-faint', 'line', 'bg', 'surface2', 'sink', 'f-body', 'f-title', 'f-mono',
    'r', 'r-s', 'r-m', 'r-sm', 'r-xs', 'r-ctl', 'r-lg', 'r-micro', 'accent-lo', 'on-solid', 'good', 'crit', 'warn', 'agenda', 'shop']
  const found = []
  for (const file of stylesheets) {
    const css = stripComments(readFileSync(file, 'utf8'))
    for (const name of aliases) {
      const re = new RegExp(`--${name}(?![\\w-])`, 'g')
      for (const m of css.matchAll(re)) found.push(hit(file, css, m.index, `--${name}`))
    }
  }
  assert.deepEqual(found, [])
})

test('every var(--x) without a fallback names a token the shell defines or a parameter the plugin defines', () => {
  const defined = new Set()
  const collect = (text) => { for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]) }
  collect(readFileSync(join(root, 'packages/web/src/app/tokens.css'), 'utf8'))
  const found = []
  for (const id of plugins) {
    const dir = join(root, 'plugins', id, 'web')
    if (!existsSync(dir)) continue
    const own = new Set(defined)
    for (const f of readdirSync(dir)) {
      if (!/\.(css|js)$/.test(f) || f === 'decoder.js') continue
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/(--[\w-]+)\s*[:'"]/g)) own.add(m[1])
    }
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      const file = join(dir, f)
      const css = stripComments(readFileSync(file, 'utf8'))
      for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (!own.has(m[1])) found.push(hit(file, css, m.index, `${m[1]} used, defined nowhere`))
      }
    }
  }
  assert.deepEqual(found, [])
})

test('no hexadecimal, rgb(), rgba() or hsl() colour outside a var() fallback', () => {
  const found = []
  for (const file of stylesheets) {
    const css = withoutVars(stripComments(readFileSync(file, 'utf8')))
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g)) found.push(hit(file, css, m.index, m[0]))
  }
  assert.deepEqual(found, [])
})

test('no 999px radius', () => {
  const found = []
  for (const file of stylesheets) {
    const css = stripComments(readFileSync(file, 'utf8'))
    for (const m of css.matchAll(/999px/g)) found.push(hit(file, css, m.index, '999px'))
  }
  assert.deepEqual(found, [])
})

test('no outline: none without a ring painted in the same rule', () => {
  const found = []
  for (const file of stylesheets) {
    const css = stripComments(readFileSync(file, 'utf8'))
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const body = m[2]
      if (!/outline\s*:\s*(none|0)\b/.test(body)) continue
      if (/box-shadow\s*:\s*(?!none)/.test(body) || /outline\s*:\s*(?!none|0\b)/.test(body)) continue
      found.push(hit(file, css, m.index, `${m[1].trim()} has outline: none and no ring`))
    }
  }
  assert.deepEqual(found, [])
})

test('plugins no longer cite ATELIER-3.md or PARCOURS.md, documents the repository does not have', () => {
  let out = ''
  try { out = execFileSync('git', ['grep', '-n', '-e', 'ATELIER-3\\.md', '-e', 'PARCOURS\\.md', '--', 'plugins/'], { cwd: root, encoding: 'utf8' }) } catch (error) { if (error.status !== 1) throw error }
  // this very file names them to forbid them
  const lines = out.split('\n').filter((line) => line && !line.startsWith('plugins/test/besoin-plugins.test.js'))
  assert.deepEqual(lines, [])
})

test('the French tables of the plugins say vous: no tu, te, toi, ton, ta, tes, t’ in any French entry', async () => {
  const found = []
  const apiFor = (id) => ({ id, base: `/plugins/${id}/`, locale: 'fr', fetch: () => Promise.reject(new Error('inert')), ask() {}, compose() {}, trail() {}, PageEditor: () => null })
  for (const id of plugins) {
    const manifest = JSON.parse(readFileSync(join(root, 'plugins', id, 'adestia-plugin.json'), 'utf8'))
    for (const facet of ['view', 'blocks', 'chrome', 'layouts']) {
      if (!manifest[facet]) continue
      const module = await import(pathToFileURL(join(root, 'plugins', id, String(manifest[facet]))).href)
      const words = module.default(apiFor(id))?.words ?? {}
      for (const [key, value] of Object.entries(words)) {
        if (typeof value === 'string' && /(^|[^\p{L}])(tu|te|toi|ton|ta|tes|t[’'])(?![\p{L}])/iu.test(value)) found.push(`${id} (${facet}): ${key} -> ${value}`)
      }
    }
  }
  assert.deepEqual(found, [])
})
