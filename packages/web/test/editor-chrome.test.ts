/**
 * The editing chrome's palette contract.
 *
 * Crepe ships its toolbar, slash menu, block handle and tooltips as STRUCTURE
 * (`theme/common/*.css`, which milkdown.ts imports) plus a PALETTE (a theme
 * file, which Golem deliberately does not import — a second palette would
 * compete with the skin's). shell.css declares the `--crepe-*` set from
 * Golem's own tokens instead.
 *
 * Miss one name and CSS fails silently: the property is invalid at
 * computed-value time, so `background: var(--crepe-color-surface)` becomes
 * transparent and `box-shadow: var(--crepe-shadow-1)` becomes none. That is
 * how the whole toolbar once rendered as black glyphs floating over the text
 * — present, clickable, invisible. No component test can see it: the editor
 * suite injects a fake `mount`, and jsdom paints nothing.
 *
 * So the check is on the two files themselves. The names Golem owes are the
 * ones Crepe's structure CONSUMES and one of Crepe's own themes DECLARES —
 * an intersection rather than a list, so a Crepe upgrade that adds a knob
 * fails here instead of on somebody's screen.
 */

import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Resolved through the package's own export map, not by guessing a path
// inside node_modules: the specifiers below are exactly the ones milkdown.ts
// imports, so this test breaks the day they stop resolving.
const resolve = createRequire(import.meta.url).resolve
const crepeCommon = dirname(resolve('@milkdown/crepe/theme/common/style.css'))
const crepeTheme = resolve('@milkdown/crepe/theme/frame.css')
const shell = join(dirname(fileURLToPath(import.meta.url)), '../src/app/shell.css')

const names = (css: string, pattern: RegExp) =>
  new Set(Array.from(css.matchAll(pattern), (match) => match[1] as string))

const consumed = names(
  readdirSync(crepeCommon)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(crepeCommon, file), 'utf8'))
    .join('\n'),
  /var\(\s*(--crepe-[a-z0-9-]+)/g,
)
const themeable = names(readFileSync(crepeTheme, 'utf8'), /^\s*(--crepe-[a-z0-9-]+)\s*:/gm)
const declared = names(readFileSync(shell, 'utf8'), /^\s*(--crepe-[a-z0-9-]+)\s*:/gm)

describe('the editing chrome reads a palette Golem actually declares', () => {
  it('finds Crepe still asking for its palette through custom properties', () => {
    // Guards the guard: if a Crepe upgrade stopped using `--crepe-*`, the
    // intersection below would go empty and pass for the wrong reason.
    expect(consumed.size).toBeGreaterThan(10)
    expect(themeable.size).toBeGreaterThan(10)
  })

  it('declares every knob Crepe both uses and expects a theme to set', () => {
    const owed = [...themeable].filter((name) => consumed.has(name)).sort()
    expect(owed.filter((name) => !declared.has(name))).toEqual([])
  })
})
