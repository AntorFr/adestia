// Black-box tests of the exit criterion of `adestia-qualite-serveur` (B-11,
// B-12; R-1 to R-8, R-13, R-15 of ARCHITECTURE.md), written from the criterion
// and not from the diff. Each test states the change that would turn it red.
//
// Plan (need -> case -> proof):
//   R-1/R-2  one definition of the MCP header rule, of the device-code run and
//            of the engine aids       -> source scan of packages/drivers/src
//   R-3      no route registered by a top-level file of server/src, app.ts
//            holds no TurnLimiter / runUnattended; no start() function > 150
//            lines                    -> source scan, TypeScript AST
//   R-4/R-5  one `field(`, one frontmatter module, no second sourceOf /
//            fetchClone / cacheDir    -> source scan
//   R-6      dead / test-only exports out of the production indexes; the
//            export report holds only exports named in ARCHITECTURE.md
//                                     -> runtime keys of the indexes, the script
//   R-7      no comment pointing to the absent design document
//   R-8      the lint config promises what its rules do; the lint runs in CI
//   R-13/15  the Copilot program is a real file; zod is declared
// Expected values are literals taken from the criterion.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const abs = (p: string) => join(root, p)
const text = (p: string) => readFileSync(abs(p), 'utf8')

const walk = (dir: string, accept: (file: string) => boolean): string[] =>
  readdirSync(abs(dir)).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-web') return []
    const rel = `${dir}/${name}`
    return statSync(abs(rel)).isDirectory() ? walk(rel, accept) : accept(rel) ? [rel] : []
  })

const sources = (dir: string) => walk(dir, (f) => /\.(ts|tsx|mjs|js)$/.test(f))

/** Files in `dir` that DEFINE `name` (function, const/let/var). */
const definitions = (name: string, dir: string): string[] => {
  const re = new RegExp(`(?:function\\*?\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\b)`)
  return sources(dir).filter((f) => re.test(text(f)))
}

describe('R-1 · the MCP authorization header rule is written once', () => {
  it('no engine builds a Bearer header itself; only drivers/src/mcp-headers.ts does', () => {
    // red if one engine copies the rule back
    const holders = sources('packages/drivers/src').filter((f) => /Bearer \$\{/.test(text(f)))
    expect(holders).toEqual(['packages/drivers/src/mcp-headers.ts'])
  })
})

describe('R-2 · the engine aids are defined once in packages/drivers/src', () => {
  it.each(['truncate', 'health'])('%s has one definition', (name) => {
    expect(definitions(name, 'packages/drivers/src')).toEqual(['packages/drivers/src/engine-aids.ts'])
  })
  it.each(['usageOf', 'classifyAuthError', 'explainAuthProblem'])('%s has one implementation', (name) => {
    // one-line aliases and wrappers of the engines (const x = …) carry no logic and are tolerated;
    // an implementation is a function declaration
    const re = new RegExp(`function\\*?\\s+${name}\\b`)
    expect(sources('packages/drivers/src').filter((f) => re.test(text(f)))).toEqual([
      'packages/drivers/src/engine-aids.ts',
    ])
  })
  it('the device-code run (begin / complete / cancel) lives in device-code.ts and Copilot and Codex use it', () => {
    expect(existsSync(abs('packages/drivers/src/device-code.ts'))).toBe(true)
    for (const driver of ['copilot-cli', 'codex-cli']) {
      expect(text(`packages/drivers/src/${driver}/driver.ts`)).toMatch(/from '\.\.\/device-code\.js'/)
    }
  })
})

describe('R-3 · app.ts mounts, routes live under routes/', () => {
  const topLevel = readdirSync(abs('packages/server/src')).filter((n) => n.endsWith('.ts'))
  const ROUTE = /\b\w+\.(?:get|post|put|patch|delete|head|options|all|route)\(\s*[`'"]\//

  it('no top-level file of packages/server/src registers a route', () => {
    // red if a handler is written back into app.ts or a sibling
    const offenders = topLevel.filter((n) => ROUTE.test(text(`packages/server/src/${n}`)))
    expect(offenders).toEqual([])
  })

  it('app.ts holds neither TurnLimiter nor runUnattended', () => {
    const app = text('packages/server/src/app.ts')
    expect(/\bclass\s+TurnLimiter\b|\bTurnLimiter\b/.test(app)).toBe(false)
    expect(/\brunUnattended\b/.test(app)).toBe(false)
  })

  it('no function in start.ts is longer than 150 lines', () => {
    const file = 'packages/server/src/start.ts'
    const sf = ts.createSourceFile(file, text(file), ts.ScriptTarget.Latest, true)
    const long: string[] = []
    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const a = sf.getLineAndCharacterOfPosition(node.getStart()).line
        const b = sf.getLineAndCharacterOfPosition(node.getEnd()).line
        const lines = b - a + 1
        if (lines > 150) long.push(`line ${a + 1}: ${lines} lines`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    expect(long).toEqual([])
  })
})

describe('R-4 / R-5 · one home per helper on the server', () => {
  it('splitFrontmatter and parseFrontmatter live in their own module, not in pages.ts', () => {
    expect(definitions('splitFrontmatter', 'packages/server/src')).toEqual(['packages/server/src/frontmatter.ts'])
    expect(definitions('parseFrontmatter', 'packages/server/src')).toEqual(['packages/server/src/frontmatter.ts'])
    expect(text('packages/server/src/pages.ts')).not.toMatch(/function\s+(split|parse)Frontmatter/)
  })
  it('field( is defined once in packages/server/src', () => {
    // a function named field( — loop variables called `field` are not definitions
    const re = /function\s+field\s*\(|\b(?:const|let)\s+field\s*=\s*(?:async\s*)?(?:\(|function)/
    expect(sources('packages/server/src').filter((f) => re.test(text(f)))).toEqual(['packages/server/src/frontmatter.ts'])
  })
  it.each(['sourceOf', 'fetchClone', 'cacheDir'])('routes/instruction-catalogues.ts does not redefine %s', (name) => {
    const re = new RegExp(`(?:function\\*?\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\b)`)
    expect(re.test(text('packages/server/src/routes/instruction-catalogues.ts'))).toBe(false)
  })
})

describe('R-6 · production surface', () => {
  it('the content index no longer exports formatReference, isValidId, isEditable', async () => {
    const content = (await import('@antorfr/adestia-content')) as Record<string, unknown>
    for (const name of ['formatReference', 'isValidId', 'isEditable']) {
      expect(Object.keys(content)).not.toContain(name)
    }
  })
  it('the drivers index exports assertConformance, which start() consumes at boot (AD-22)', async () => {
    const drivers = (await import('@antorfr/adestia-drivers')) as Record<string, unknown>
    expect(Object.keys(drivers)).toContain('assertConformance')
  })
  it('the subscription quotas type of the old contract exists nowhere under packages', () => {
    const word = 'Subscription' + 'Quotas'
    const hits = walk('packages', (f) => /\.(ts|tsx|mjs|js|json|md)$/.test(f)).filter((f) => text(f).includes(word))
    expect(hits).toEqual([])
  })

  const report = (() => {
    const run = spawnSync(process.execPath, [abs('scripts/unused-exports.mjs')], { cwd: root, encoding: 'utf8' })
    return { status: run.status, entries: run.stdout.split('\n').filter(Boolean) }
  })()

  it('the export report runs', () => {
    expect(report.status).toBe(0)
    expect(report.entries.length).toBeGreaterThan(0)
  })
  it('every export the report holds (public-contract type or internal kept for its test) is named in ARCHITECTURE.md', () => {
    const doc = text('ARCHITECTURE.md')
    const unnamed = report.entries.map((e) => e.split(':')[1]!).filter((name) => !doc.includes(`\`${name}\``))
    expect(unnamed).toEqual([])
  })
})

describe('R-7 · no comment points to an absent document', () => {
  it('nothing under packages mentions the design document that is not in the repository', () => {
    const word = 'technique' + '.md'
    const hits = walk('packages', (f) => /\.(ts|tsx|mjs|js|json|md|css)$/.test(f)).filter((f) => text(f).includes(word))
    expect(hits).toEqual([])
  })
})

describe('R-8 · the lint says what it does, and runs in CI', () => {
  const lint = (code: string) =>
    spawnSync(
      process.execPath,
      [abs('node_modules/eslint/bin/eslint.js'), '--stdin', '--stdin-filename', 'packages/server/src/_probe.ts'],
      { cwd: root, input: code, encoding: 'utf8' },
    )

  it('an unused binding is an error (the rule the config claims)', () => {
    expect(lint('const unused = 1\nexport {}\n').status).toBe(1)
  })
  it('a floating promise and an ignored caught error pass; the config does not claim to catch them', () => {
    const run = lint(
      'async function f() { return 1 }\nexport function g() { f(); try { f() } catch (e) { /* ignored */ } }\n',
    )
    expect(run.status).toBe(0)
    const header = text('eslint.config.js').split('*/')[0]!
    for (const line of header.split('\n').filter((l) => /floating|thrown[- ]away|unhandled|swallowed/i.test(l))) {
      expect(line).toMatch(/\b(no|not|cannot|nothing|never)\b/i)
    }
  })
  it('the CI workflow runs npm run lint', () => {
    expect(text('.github/workflows/ci.yml')).toMatch(/^\s*run: npm run lint\s*$/m)
  })
})

describe('R-13 / R-15', () => {
  it('the Copilot shell-tool program is a real file that Node parses, not a template string', () => {
    const file = 'packages/drivers/src/copilot-cli/shell-tool.mjs'
    expect(existsSync(abs(file))).toBe(true)
    expect(spawnSync(process.execPath, ['--check', abs(file)]).status).toBe(0)
    for (const f of sources('packages/drivers/src')) {
      expect(text(f)).not.toMatch(/SHELL_TOOL_CLI_SOURCE\s*(?::[^=]+)?=\s*`/)
    }
  })
  it('zod is a declared dependency of the server', () => {
    const pkg = JSON.parse(text('packages/server/package.json')) as { dependencies?: Record<string, string> }
    expect(Object.keys(pkg.dependencies ?? {})).toContain('zod')
  })
})

