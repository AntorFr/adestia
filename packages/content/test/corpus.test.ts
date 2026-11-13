/**
 * The non-regression corpus: what `main` writes back, pinned before the grammar moves.
 *
 * B-31 promises that a page is written back byte-for-byte as before its edit.
 * `fixtures/corpus/` holds the pages that promise has to hold for: every page
 * a bench seed writes (copied, not linked) and hand-written edge cases. Each
 * is read then written back. A page already canonical must come back as it
 * was; any other has its rewrite pinned in `<name>.out` beside it (CRLF,
 * unquoted attributes, a blank last line… what `main` normalises), and must
 * come back as THAT, byte for byte. The seeds are enumerated by running them,
 * so a new seed page fails here until it is copied in.
 *
 * Missing `.out` files are written only with `CORPUS_WRITE=1`; a fixture does
 * not move afterwards.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parse, serialize } from '../src/pipeline.js'
// @ts-expect-error plain Node helper, shared with the script that writes the fixtures
import { pagesOfSeed, seedNames } from './corpus/seed-pages.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'fixtures', 'corpus')
const seedDir = join(here, '..', '..', '..', 'bench', 'seed')
const names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
const read = (f: string) => readFileSync(join(dir, f), 'utf8')
const write = process.env['CORPUS_WRITE'] === '1'

describe('corpus of pages', () => {
  it('has hand-written edge cases and seed pages', () => {
    expect(names.filter((n) => n.startsWith('hand--')).length).toBeGreaterThanOrEqual(5)
    expect(names.filter((n) => n.startsWith('seed--')).length).toBeGreaterThan(0)
  })

  it('has no .out without its fixture', () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.out'))) {
      expect(names, f).toContain(f.replace(/\.out$/, '.md'))
    }
  })

  it('holds every page every seed writes', { timeout: 180_000 }, async () => {
    const have = new Set(names.map(read))
    const seeds: string[] = await seedNames(seedDir)
    expect(seeds).toContain('plugins')
    expect(seeds).toContain('plugins-ensemble')
    expect(seeds).not.toContain('_base')
    expect(seeds).not.toContain('_plugins')
    const missing: string[] = []
    for (const seed of seeds) {
      for (const page of (await pagesOfSeed(seedDir, seed)) as { path: string; contents: string }[]) {
        if (!have.has(page.contents)) missing.push(`${seed}: ${page.path}`)
      }
    }
    expect(missing).toEqual([])
  })

  for (const name of names) {
    it(`${name} is written back as main writes it`, () => {
      const source = read(name)
      const rewritten = serialize(parse(source))
      const out = join(dir, name.replace(/\.md$/, '.out'))
      if (write && rewritten !== source && !existsSync(out)) writeFileSync(out, rewritten)
      if (existsSync(out)) {
        expect(rewritten, 'the rewrite differs from its pin').toBe(readFileSync(out, 'utf8'))
        expect(rewritten, 'a .out equal to its source pins nothing: delete it').not.toBe(source)
      } else {
        expect(rewritten, 'not canonical and no .out pins the rewrite').toBe(source)
      }
    })
  }
})
