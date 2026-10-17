/**
 * The charter tranche's exit criterion, the parts that are read in files rather than seen
 * on a screen (B-6, B-7, B-8, AD-4, R-11, R-12). The expectations are the fiche's and
 * docs/charte.md's, written here as literals.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path: string) => readFileSync(join(repo, path), 'utf8')
const web = 'packages/web/src/app'

function walk(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = []
  if (!existsSync(join(repo, dir))) return out
  for (const name of readdirSync(join(repo, dir))) {
    const path = join(dir, name)
    if (statSync(join(repo, path)).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist' && name !== 'dist-web') out.push(...walk(path, accept))
    } else if (accept(path)) out.push(path)
  }
  return out
}

const SHEETS = [`${web}/styles/settings.css`, `${web}/styles/settings-pages.css`, `${web}/styles/tiles.css`]
const withTokens = [`${web}/tokens.css`, ...SHEETS]
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('B-6 — tokens.css and the settings sheets', () => {
  const tokens = stripComments(read(`${web}/tokens.css`))

  it('defines the seven-step type scale at 11, 12, 13, 15, 18, 22 and 28 px (px or rem at a 16 px root)', () => {
    const px = [...tokens.matchAll(/--text-(2xs|xs|sm|base|md|lg|xl|2xl):\s*([\d.]+)(px|rem)\s*;/g)].map((m) => Math.round(Number(m[2]) * (m[3] === 'rem' ? 16 : 1)))
    expect(px.sort((x, y) => x - y)).toEqual([11, 12, 13, 15, 18, 22, 28])
  })

  it('defines the radius set 6, 10 and 14 px and the 999 px pill', () => {
    expect(tokens).toMatch(/--radius-sm:\s*6px/)
    expect(tokens).toMatch(/--radius:\s*10px/)
    expect(tokens).toMatch(/--radius-lg:\s*14px/)
    expect(tokens).toMatch(/--radius-pill:\s*999px/)
  })

  it('writes the palette once as light-dark(), without a second pasted dark palette', () => {
    for (const name of ['--text', '--surface', '--surface-raised', '--border', '--accent', '--danger']) {
      const declarations = tokens.match(new RegExp(`(^|[;{\\s])${name}:`, 'g')) ?? []
      expect(declarations.length, `${name} declared`).toBe(1)
    }
    expect(tokens).toMatch(/--surface:\s*light-dark\(/)
    const dark = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'))
    const block = dark.slice(0, dark.indexOf('\n}\n'))
    expect(block.match(/--[a-z-]+(?=:)/g)?.sort()).toEqual(['--shadow', '--shadow-lg'])
  })

  it('has no font-size or border-radius literal in tokens.css and the three settings sheets', () => {
    const hits: string[] = []
    for (const file of withTokens) {
      const lines = stripComments(read(file)).split('\n')
      lines.forEach((line, i) => {
        if (/(^|[;{\s])font-size:\s*[\d.]+(px|rem|em)/.test(line)) hits.push(`${file}:${i + 1} ${line.trim()}`)
        if (/(^|[;{\s])border(-[a-z]+)*-radius:\s*[^;]*\b\d+(\.\d+)?(px|rem|em)\b/.test(line)) hits.push(`${file}:${i + 1} ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('writes no colour in the three settings sheets outside a var() fallback', () => {
    const hits: string[] = []
    for (const file of SHEETS) {
      stripComments(read(file))
        .split('\n')
        .forEach((line, i) => {
          // what remains once every var(--x, <fallback>) is removed must hold no colour
          let rest = line
          for (let n = 0; n < 5; n++) rest = rest.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '')
          if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|hwb)\(|\b(white|black|red|green|blue|gray|grey)\b\s*[;,)]/.test(rest)) hits.push(`${file}:${i + 1} ${line.trim()}`)
        })
    }
    expect(hits).toEqual([])
  })

  it('uses no token that nothing defines', () => {
    const defined = new Set<string>()
    const sources = [...walk('packages/web/src', (f) => /\.(css|tsx?)$/.test(f)), ...walk('skins', (f) => /\.(css|js|ts)$/.test(f))]
    for (const file of sources) {
      for (const m of read(file).matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1] as string)
      for (const m of read(file).matchAll(/['"`](--[a-z0-9-]+)['"`]/gi)) defined.add(m[1] as string) // set from script
    }
    const used = new Map<string, string>()
    for (const file of withTokens) for (const m of stripComments(read(file)).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) used.set(m[1] as string, file)
    const orphans = [...used].filter(([name]) => !defined.has(name)).map(([name, file]) => `${name} (${relative('', file)})`)
    expect(orphans).toEqual([])
  })
})

describe('B-6 — docs/charte.md § 5 lists every pair at its threshold', () => {
  const rows = read('docs/charte.md')
    .split('\n')
    .filter((line) => /^\|/.test(line) && /\| (light|dark) \|/.test(line))
    .map((line) => line.split('|').map((c) => c.trim()))
  const skinRows = rows.filter((c) => ['alfred', 'dobby', 'nestor', 'skippy'].includes(c[1] as string))
  const baseRows = rows.filter((c) => c[1]?.startsWith('`--'))

  it('lists the 36 pairs of the base palette in light and in dark', () => {
    expect(baseRows.filter((c) => c[3] === 'light').length).toBe(36)
    expect(baseRows.filter((c) => c[3] === 'dark').length).toBe(36)
  })

  it.each([
    ['alfred', 36],
    ['nestor', 36],
    ['skippy', 36],
    ['dobby', 37],
  ])('lists the pairs of %s in both themes (%i each)', (skin, count) => {
    for (const theme of ['light', 'dark']) expect(skinRows.filter((c) => c[1] === skin && c[4] === theme).length, `${skin} ${theme}`).toBe(count)
  })

  it('has no pair under its threshold, since § 6 accepts none', () => {
    const under = [
      ...baseRows.map((c) => ({ id: `base ${c[1]} on ${c[2]} ${c[3]}`, ratio: c[4], threshold: c[5] })),
      ...skinRows.map((c) => ({ id: `${c[1]} ${c[2]} on ${c[3]} ${c[4]}`, ratio: c[5], threshold: c[6] })),
    ].filter((r) => Number(r.ratio) < Number(r.threshold))
    expect(under).toEqual([])
    expect(read('docs/charte.md')).toMatch(/## 6\. Accepted departures\s+None:/)
  })
})

describe('B-8 — the French table of i18n.ts', () => {
  it('has no form in tu: no tu, toi, ton, ta, tes, te or t’ in the table', () => {
    const source = read(`${web}/i18n.ts`)
    const table = source.slice(source.indexOf('const FR:'), source.indexOf('const TABLES'))
    const hits = table.split('\n').filter((line) => /(^|[^\p{L}])(tu|toi|ton|ta|tes|te|t’|t')($|[^\p{L}])/iu.test(line.replace(/^\s*(['"]).*?\1:/, '')))
    expect(hits).toEqual([])
  })
})

describe('R-11 — one request helper', () => {
  const FILES = [
    'Gates.tsx', 'signin.ts', 'useInstance.ts', 'Preferences.tsx', 'Tile.tsx', 'McpServers.tsx', 'Settings.tsx',
    'Instructions.tsx', 'CataloguePopin.tsx', 'Delegations.tsx', 'Configuration.tsx', 'SettingsMenu.tsx',
  ].map((f) => `${web}/${f}`)
  const split = ['configuration', 'instructions', 'mcp'].flatMap((d) => walk(`${web}/${d}`, (f) => /\.tsx?$/.test(f)))

  it('exists in packages/web/src and ARCHITECTURE.md names it', () => {
    const architecture = read('ARCHITECTURE.md')
    expect(architecture).toMatch(/packages\/web\/src\/app\/request\.ts/)
    expect(statSync(join(repo, `${web}/request.ts`)).isFile()).toBe(true)
  })

  it('leaves no raw fetchImpl( call in the components of E-1 and E-9 to E-15, signin.ts and useInstance.ts', () => {
    const hits = [...FILES, ...split].filter((file) => /\bfetchImpl\(/.test(read(file)))
    expect(hits).toEqual([])
  })
})

describe('R-12 — Instructions, Configuration and McpServers are split', () => {
  it.each(['Instructions.tsx', 'Configuration.tsx', 'McpServers.tsx'])('%s has no function of more than 250 lines', (name) => {
    const text = read(`${web}/${name}`)
    const sourceFile = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const long: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line
        if (end - start + 1 > 250) long.push(`${name}:${start + 1} (${end - start + 1} lines)`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    expect(long).toEqual([])
  })
})

describe('B-7 — the plugin authors are told about the shared components', () => {
  it('skills/plugin-author documents the button, sheet, popover, empty state, field and icon classes', () => {
    const doc = read('skills/plugin-author/SKILL.md')
    for (const cls of ['.adestia-btn', '.adestia-sheet', '.adestia-popover', '.adestia-empty', '.adestia-field', '.adestia-icon']) expect(doc, cls).toContain(cls)
    expect(doc, 'how to draw an icon').toContain('#adestia-i-')
  })

  it('serves the shared component classes from the shell stylesheet', () => {
    const css = read(`${web}/styles/components.css`)
    for (const cls of ['.adestia-btn', '.adestia-btn--accent', '.adestia-btn--danger', '.adestia-btn--ghost', '.adestia-btn--icon', '.adestia-sheet', '.adestia-popover', '.adestia-empty', '.adestia-field', '.adestia-input', '.adestia-textarea', '.adestia-toggle'])
      expect(css, cls).toContain(cls)
  })
})
