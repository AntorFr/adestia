import { readFileSync, writeFileSync } from 'node:fs'

import { expect, it } from 'vitest'

const tokensUrl = new URL('../src/app/tokens.css', import.meta.url)
const charterUrl = new URL('../../../docs/charte.md', import.meta.url)
const skinUrl = (id: string) => new URL(`../../../skins/${id}/skin.css`, import.meta.url)
const css = readFileSync(tokensUrl, 'utf8')
type Tokens = Record<string, string>
// The base palette has one root declaration per colour; theme selectors only
// choose the scheme. Skins extend this table with their own declarations.
const base: Tokens = Object.fromEntries(
  [...css.slice(0, css.indexOf("\n:root[data-theme='light']"))
    .matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
)
const surfaces = ['--surface', '--surface-raised', '--surface-soft', '--surface-sunken']
const text = ['--text', '--text-muted', '--text-faint', '--accent-text',
  '--danger-text', '--warning-text', '--success-text']
type Pair = [string, string, number]
const pairs: Pair[] = [
  ...text.flatMap((fg) => surfaces.map((bg): Pair => [fg, bg, 4.5])),
  ...surfaces.map((bg): Pair => ['--accent', bg, 3]),
  ...['--accent', '--danger', '--warning', '--success']
    .map((bg): Pair => ['--on-accent', bg, 4.5]),
]

/** Declarations of every rule of a sheet, keyed by its selector (lists split). */
function rules(sheet: string): [string, Tokens][] {
  const flat = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [
    m[1]!.trim(),
    Object.fromEntries([...m[2]!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2]!.trim()])),
  ])
}

/** The declarations a skin applies in one theme: its identity rule, then its palette rule. */
function declared(sheet: string, selectors: string[]): Tokens {
  const out: Tokens = {}
  for (const wanted of selectors) {
    const found = rules(sheet).filter(([sel]) => sel.split(',').some((s) => s.trim() === wanted))
    if (!found.length) throw new Error(`Missing rule: ${wanted}`)
    for (const [, decls] of found) Object.assign(out, decls)
  }
  return out
}

interface Scope { skin: string, theme: 'light' | 'dark', tokens: Tokens, extra: Pair[] }
const scopes: Scope[] = []
for (const theme of ['light', 'dark'] as const) scopes.push({ skin: 'base', theme, tokens: base, extra: [] })
// Alfred wears the base sheet as-is: its file declares no palette to read.
for (const theme of ['light', 'dark'] as const) scopes.push({ skin: 'alfred', theme, tokens: base, extra: [] })
function addSkin(id: string, light: string, dark: string, extra: Pair[] = []): void {
  const sheet = readFileSync(skinUrl(id), 'utf8')
  const root = `:root[data-skin='${id}']`
  for (const [theme, selector] of [['light', light], ['dark', dark]] as const) {
    scopes.push({ skin: id, theme, tokens: { ...base, ...declared(sheet, [root, selector]) }, extra })
  }
}
// dobby and skippy impose their night (`scheme: dark`) and keep a light variant on
// explicit request; nestor follows the system. Each is measured in what its file declares.
addSkin('nestor', ":root[data-skin='nestor'][data-theme='light']", ":root[data-skin='nestor'][data-theme='dark']")
addSkin('dobby', ":root[data-skin='dobby'][data-theme='light']", ":root[data-skin='dobby']:not([data-theme='light'])",
  [['--dby-cuir-text', '--dby-cuir', 4.5]])
addSkin('skippy', ":root[data-skin='skippy'][data-theme='light']", ":root[data-skin='skippy']:not([data-theme='light'])")

function resolve(tokens: Tokens, token: string, theme: number, seen: string[] = []): string {
  if (seen.includes(token)) throw new Error(`Circular token: ${[...seen, token].join(' → ')}`)
  let value = tokens[token]
  if (!value) throw new Error(`Undefined token: ${token}`)
  const themed = /^light-dark\((#[\da-f]+),\s*(#[\da-f]+)\)$/i.exec(value)
  if (themed) value = themed[theme + 1]!
  const alias = /^var\((--[\w-]+)\)$/.exec(value)
  if (alias) return resolve(tokens, alias[1]!, theme, [...seen, token])
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Unsupported colour: ${token} = ${value}`)
  return value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function measure(scope: Scope) {
  const index = scope.theme === 'light' ? 0 : 1
  return [...pairs, ...scope.extra].map(([fg, bg, threshold]) => {
    const foreground = resolve(scope.tokens, fg, index)
    const background = resolve(scope.tokens, bg, index)
    const a = luminance(foreground)
    const b = luminance(background)
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    return { skin: scope.skin, fg, bg, theme: scope.theme, foreground, background, ratio, threshold }
  })
}

type Row = ReturnType<typeof measure>[number]
const header = ['| Foreground | Background | Theme | Ratio | Threshold | Result |', '|---|---|---|---|---|---|']
const line = (r: Row) => `| \`${r.fg}\` ${r.foreground} | \`${r.bg}\` ${r.background} | ${r.theme} | ${r.ratio.toFixed(2)} | ${r.threshold} | ${r.ratio >= r.threshold ? 'ok' : 'fail'} |`

function replaceBetween(doc: string, name: string, body: string): string {
  const start = `<!-- ${name}:start -->`
  const end = `<!-- ${name}:end -->`
  if (!doc.includes(start) || !doc.includes(end)) throw new Error(`Missing contrast table markers: ${name}`)
  return doc.slice(0, doc.indexOf(start) + start.length) + '\n' + body + '\n' + doc.slice(doc.indexOf(end))
}

it('measures the base palette and the four skins in the themes they declare, and prints the charter tables', () => {
  const rows = scopes.flatMap(measure)
  const baseTable = [...header, ...rows.filter((r) => r.skin === 'base').map(line)].join('\n')
  const skinTable = ['| Skin | Foreground | Background | Theme | Ratio | Threshold | Result |', '|---|---|---|---|---|---|---|',
    ...rows.filter((r) => r.skin !== 'base').map((r) => `| ${r.skin} ${line(r)}`)].join('\n')
  console.log(baseTable + '\n\n' + skinTable)
  // Explicit opt-in: ordinary tests never mutate product documentation.
  if (process.env.UPDATE_CONTRAST_TABLE === '1') {
    let charter = readFileSync(charterUrl, 'utf8')
    charter = replaceBetween(charter, 'base-contrast', baseTable)
    charter = replaceBetween(charter, 'skin-contrast', skinTable)
    writeFileSync(charterUrl, charter)
  }
  for (const row of rows) {
    expect(row.ratio, `${row.skin} ${row.theme}: ${row.fg} on ${row.bg}`).toBeGreaterThanOrEqual(row.threshold)
  }
})

it("keeps nestor's system-dark rule identical to its explicit dark rule", () => {
  const sheet = readFileSync(skinUrl('nestor'), 'utf8')
  const colour = (t: Tokens) => Object.fromEntries(Object.entries(t).filter(([k]) => !/shadow|scrim|plate|nst-/.test(k)))
  const system = rules(sheet).find(([sel]) => sel === ":root[data-skin='nestor']:not([data-theme='light'])")
  expect(system, 'media rule').toBeDefined()
  expect(colour(system![1])).toEqual(colour(declared(sheet, [":root[data-skin='nestor'][data-theme='dark']"])))
})
