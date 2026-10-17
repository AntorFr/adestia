import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(root + p, 'utf8')

describe('garde-fous du serveur', () => {
  it('le lint tourne en CI', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/run:\s*npm run lint/)
  })

  it('eslint.config.js ne promet plus de règle typée', () => {
    const head = read('eslint.config.js').split('*/')[0]
    expect(head).not.toMatch(/floating/i)
    expect(read('eslint.config.js')).toContain("caughtErrors: 'none'")
  })

  it('zod est déclaré par le serveur, au lockfile identique', () => {
    const pkg = JSON.parse(read('packages/server/package.json'))
    const lock = JSON.parse(read('package-lock.json'))
    expect(pkg.dependencies.zod).toBe('4.4.3')
    expect(lock.packages['packages/server'].dependencies.zod).toBe('4.4.3')
    expect(lock.packages['node_modules/zod'].version).toBe('4.4.3')
  })

  it('unused-exports liste fichier:nom, aucun fichier web, et le décompte est dans ARCHITECTURE.md', () => {
    const run = spawnSync('node', ['scripts/unused-exports.mjs'], { cwd: root, encoding: 'utf8' })
    expect(run.status).toBe(0)
    const lines = run.stdout.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l).toMatch(/^packages\/(?!web\/)[^/]+\/src\/\S+:\S+$/)
    expect(lines.some((l) => l.startsWith('packages/web/'))).toBe(false)
    expect([...lines].sort()).toEqual(lines)
    expect(read('ARCHITECTURE.md')).toContain(`**${lines.length}**`)
  }, 60_000)
})
