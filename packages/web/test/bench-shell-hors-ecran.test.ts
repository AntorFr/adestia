/**
 * What bench/tests/shell-besoin.test.mjs proved through a browser about the spin rule and that
 * the sources say: the shell's sources and the four skins define `.adestia-icon--spin` once at
 * top level and `@keyframes adestia-icon-spin` once. Whether the icon turns on screen stays at
 * the screen. See docs/tests-ecran/bench-plugins-shell.md.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

describe('the spin of the icons', () => {
  const texts = [...cssFiles(join(root, 'packages/web/src')), ...cssFiles(join(root, 'skins'))].map((f) => readFileSync(f, 'utf8'))

  it('reads the four skins as well as the shell', () => {
    expect(cssFiles(join(root, 'skins')).length).toBeGreaterThanOrEqual(4)
  })

  it('defines .adestia-icon--spin once at top level, across the shell and the skins', () => {
    const rules = texts.reduce((n, text) => n + (text.match(/^\.adestia-icon--spin\s*\{/gm) ?? []).length, 0)
    expect(rules).toBe(1)
  })

  it('defines @keyframes adestia-icon-spin once, across the shell and the skins', () => {
    const frames = texts.reduce((n, text) => n + (text.match(/@keyframes\s+adestia-icon-spin\b/g) ?? []).length, 0)
    expect(frames).toBe(1)
  })
})
