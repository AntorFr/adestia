import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const read = (p: string) => readFileSync(src + p, 'utf8')
const OLD = ['callback', 'files', 'pages', 'static', 'watch', 'mcp-routes']

// Every `export … from '…'` statement, including multi-line ones and `export *`.
function reexports(text: string): { names: string[]; from: string }[] {
  const out: { names: string[]; from: string }[] = []
  const re = /export\s+(?:type\s+)?(\*(?:\s+as\s+\w+)?|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/g
  for (const m of text.matchAll(re)) {
    const names = (m[2] ?? '*')
      .split(',')
      .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!)
      .filter(Boolean)
    out.push({ names, from: m[3]! })
  }
  return out
}

const ownedByRoutes = new Set<string>()
for (const f of readdirSync(src + 'routes')) {
  for (const m of read('routes/' + f).matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/gm,
  )) ownedByRoutes.add(m[1]!)
}

describe('les anciens fichiers du serveur ne réexportent plus routes/', () => {
  it('le détecteur voit les formes de réexportation', () => {
    const sample = `export { registerX, type Y } from './routes/x.js'
export type {
  A,
  B as C,
} from "./routes/y.js"
export * from './routes/z.js'`
    expect(reexports(sample)).toEqual([
      { names: ['registerX', 'Y'], from: './routes/x.js' },
      { names: ['A', 'B'], from: './routes/y.js' },
      { names: ['*'], from: './routes/z.js' },
    ])
  })

  for (const name of OLD) {
    it(`${name}.ts ne réexporte rien depuis routes/`, () => {
      if (!existsSync(src + name + '.ts')) return
      const bad = reexports(read(name + '.ts')).filter((r) => /(^|\/)routes\//.test(r.from))
      expect(bad).toEqual([])
    })
  }

  it('index.ts ne nomme aucun des six fichiers pour un symbole que routes/ possède', () => {
    const bad = reexports(read('index.ts'))
      .filter((r) => OLD.some((o) => r.from === `./${o}.js`))
      .filter((r) => r.names.includes('*') || r.names.some((n) => ownedByRoutes.has(n)))
    expect(bad).toEqual([])
  })

  it('index.ts garde la surface publique : PagesOptions, FilesOptions, StaticOptions, DelegationPort, McpDependencies', () => {
    const exported = reexports(read('index.ts')).flatMap((r) =>
      r.names.map((n) => [n, r.from] as const),
    )
    for (const n of ['PagesOptions', 'FilesOptions', 'StaticOptions', 'DelegationPort', 'McpDependencies'])
      expect(exported.find(([x]) => x === n)?.[1], n).toMatch(/^\.\/routes\//)
  })
})
