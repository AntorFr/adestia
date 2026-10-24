import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const nestor = read('../../../skins/nestor/skin.css')
const conversations = read('../src/app/styles/conversations.css')
const tokens = read('../src/app/tokens.css')

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!)
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

it('the current conversation row reads its text through the local token', () => {
  const rule = /\.adestia-conversations__item--current\s*\{([^}]*)\}/.exec(conversations)![1]!
  expect(rule).toContain('color: var(--conversation-current-text)')
  expect(tokens).toMatch(/--conversation-current-text:\s*var\(--accent-text\)/)
})

it('Nestor at night keeps the current row at 4.5:1 over its composed tint, in both dark scopes', () => {
  const overrides = [...nestor.matchAll(/--conversation-current-text:\s*(#[\da-f]{6})/gi)].map((m) => m[1]!)
  expect(overrides).toHaveLength(2)
  const quiet = [139, 108, 232]
  for (const surface of ['#131022', '#1d1836', '#171331']) {
    const bg = rgb(surface).map((c, i) => c * 0.86 + quiet[i]! * 0.14)
    for (const fg of overrides) expect(ratio(rgb(fg), bg)).toBeGreaterThanOrEqual(4.5)
  }
  // the former token fails this very measure: the override is not decoration.
  expect(ratio(rgb('#8e70e9'), rgb('#1d1836').map((c, i) => c * 0.86 + quiet[i]! * 0.14))).toBeLessThan(4.5)
})

it('the chat name no longer shrinks and keeps no 4em ceiling on a narrow rail', () => {
  const chat = read('../src/app/styles/chat.css')
  expect(/\.adestia-brandname\s*\{([^}]*)\}/.exec(chat)![1]).toContain('flex-shrink: 0')
  expect(chat).not.toMatch(/adestia-brandname\s*\{\s*max-width:\s*4em/)
})
