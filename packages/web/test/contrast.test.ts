import { readFileSync, writeFileSync } from 'node:fs'

import { expect, it } from 'vitest'

const tokensUrl = new URL('../src/app/tokens.css', import.meta.url)
const charterUrl = new URL('../../../docs/charte.md', import.meta.url)
const css = readFileSync(tokensUrl, 'utf8')
// The base palette has one root declaration per colour; theme selectors only
// choose the scheme. Skins can extend this table with their own declarations.
const tokens = Object.fromEntries(
  [...css.slice(0, css.indexOf("\n:root[data-theme='light']"))
    .matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
)
const surfaces = ['--surface', '--surface-raised', '--surface-soft', '--surface-sunken']
const text = ['--text', '--text-muted', '--text-faint', '--accent-text',
  '--danger-text', '--warning-text', '--success-text']
const pairs: [string, string, number][] = [
  ...text.flatMap((fg) => surfaces.map((bg): [string, string, number] => [fg, bg, 4.5])),
  ...surfaces.map((bg): [string, string, number] => ['--accent', bg, 3]),
  ...['--accent', '--danger', '--warning', '--success']
    .map((bg): [string, string, number] => ['--on-accent', bg, 4.5]),
]

function resolve(token: string, theme: number, seen: string[] = []): string {
  if (seen.includes(token)) throw new Error(`Circular token: ${[...seen, token].join(' → ')}`)
  let value = tokens[token]
  if (!value) throw new Error(`Undefined token: ${token}`)
  const themed = /^light-dark\((#[\da-f]+),\s*(#[\da-f]+)\)$/i.exec(value)
  if (themed) value = themed[theme + 1]!
  const alias = /^var\((--[\w-]+)\)$/.exec(value)
  if (alias) return resolve(alias[1]!, theme, [...seen, token])
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Unsupported colour: ${token} = ${value}`)
  return value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

it('measures the declared base palette pairs in both schemes and prints the charter table', () => {
  const rows = pairs.flatMap(([fg, bg, threshold]) => ['light', 'dark'].map((theme, index) => {
    const foreground = resolve(fg, index)
    const background = resolve(bg, index)
    const a = luminance(foreground)
    const b = luminance(background)
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    return { fg, bg, theme, foreground, background, ratio, threshold }
  }))
  const table = [
    '| Foreground | Background | Theme | Ratio | Threshold | Result |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`${r.fg}\` ${r.foreground} | \`${r.bg}\` ${r.background} | ${r.theme} | ${r.ratio.toFixed(2)} | ${r.threshold} | ${r.ratio >= r.threshold ? 'ok' : 'fail'} |`),
  ].join('\n')
  console.log(table)
  // Explicit opt-in: ordinary tests never mutate product documentation.
  if (process.env.UPDATE_CONTRAST_TABLE === '1') {
    const charter = readFileSync(charterUrl, 'utf8')
    const start = '<!-- base-contrast:start -->'
    const end = '<!-- base-contrast:end -->'
    if (!charter.includes(start) || !charter.includes(end)) throw new Error('Missing contrast table markers')
    writeFileSync(charterUrl, charter.slice(0, charter.indexOf(start) + start.length)
      + '\n' + table + '\n' + charter.slice(charter.indexOf(end)))
  }
  for (const row of rows) {
    expect(row.ratio, `${row.theme}: ${row.fg} on ${row.bg}`).toBeGreaterThanOrEqual(row.threshold)
  }
})
