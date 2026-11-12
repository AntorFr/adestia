/**
 * (Re)writes the SOURCE half of the non-regression corpus: one copy of each
 * distinct page a seed of `bench/seed/` writes, into `fixtures/corpus/seed--*.md`.
 * Plain Node: `node packages/content/test/corpus/write-fixtures.mjs`.
 *
 * Fixtures are copies, never links, and they do not move afterwards: a page
 * that must change says so in the task's discussion. The script therefore only
 * ADDS files; it refuses to overwrite one whose bytes differ.
 *
 * The other halves are made by the suites themselves, with `vitest run -u`:
 * `corpus.test.ts` pins what `main` rewrites when it is not the source
 * (`<name>.out`), `corpus-render.test.tsx` the reader's DOM (`<name>.html`).
 * The hand-written edge cases (`hand--*.md`) are written by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pagesOfSeed, seedNames } from './seed-pages.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = join(here, '../../../../bench/seed')
const out = join(here, '../fixtures/corpus')
mkdirSync(out, { recursive: true })

const seen = new Set()
let added = 0
for (const name of await seedNames(seedDir)) {
  for (const page of await pagesOfSeed(seedDir, name)) {
    if (seen.has(page.contents)) continue
    seen.add(page.contents)
    const file = join(out, `seed--${name}--${page.path.replaceAll('/', '__')}`)
    if (existsSync(file)) {
      if (readFileSync(file, 'utf8') !== page.contents) throw new Error(`${file} exists with other bytes`)
      continue
    }
    writeFileSync(file, page.contents)
    added++
  }
}
console.log(`${added} fixture(s) added, ${seen.size} distinct page(s) in the seeds`)
