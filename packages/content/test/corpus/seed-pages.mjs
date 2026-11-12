/**
 * Every markdown page a seed of `bench/seed/` writes, by running the seed.
 *
 * A seed is a file with an `export default` at the start of a line; the helpers
 * (`_base.mjs`, `_lib.mjs`, `_plugins.mjs`, `_scripts.mjs`) and the measuring
 * script (`check.mjs`, which runs on import) have none and are never imported:
 * their pages come through the seeds that call them. Nothing is excluded by
 * name. The clock is held at a fixed day while a seed runs, because some pages
 * carry dates relative to it ("Late", "Next 7 days").
 *
 * Plain Node, no dependency, so the corpus test and the script that (re)writes
 * the fixtures (`write-fixtures.mjs`) read the seeds the same way.
 */
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Noon UTC on a fixed day: the day the corpus was taken. */
export const FROZEN = Date.UTC(2026, 10, 12, 12, 0, 0)

export async function seedNames(seedDir) {
  const names = []
  for (const file of (await readdir(seedDir)).sort()) {
    if (!file.endsWith('.mjs')) continue
    if (/^export default\b/m.test(await readFile(join(seedDir, file), 'utf8'))) names.push(file.replace(/\.mjs$/, ''))
  }
  return names
}

async function markdownUnder(dir, skip) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink() || skip(path, entry)) continue
    if (entry.isDirectory()) found.push(...(await markdownUnder(path, skip)))
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path)
  }
  return found
}

function freezeClock() {
  const Real = globalThis.Date
  class Frozen extends Real {
    constructor(...args) {
      super(...(args.length === 0 ? [FROZEN] : args))
    }
    static now() {
      return FROZEN
    }
  }
  globalThis.Date = Frozen
  return () => {
    globalThis.Date = Real
  }
}

/** Runs one seed in a throwaway directory; returns `{path, contents}` for each page it wrote, `path` relative to that directory. */
export async function pagesOfSeed(seedDir, name) {
  const base = await mkdtemp(join(tmpdir(), 'corpus-seed-'))
  const workspace = join(base, 'workspace')
  const dataDir = join(base, 'data')
  await mkdir(workspace, { recursive: true })
  await mkdir(dataDir, { recursive: true })
  const closers = []
  const unfreeze = freezeClock()
  try {
    const seed = await import(pathToFileURL(join(seedDir, `${name}.mjs`)).href)
    await seed.default({ workspace, dataDir, base, port: 1, onClose: (close) => closers.push(close) })
    // `seed-plugins` is the plugin tree the bundled plugins are copied into: their
    // documentation is the repository's, not a page the seed wrote. `.git` is a catalogue's history.
    const skip = (path, entry) => entry.isDirectory() && (entry.name === '.git' || entry.name === 'seed-plugins' || entry.name === 'node_modules')
    const pages = []
    for (const file of (await markdownUnder(base, skip)).sort()) {
      pages.push({ path: relative(base, file).split('\\').join('/'), contents: await readFile(file, 'utf8') })
    }
    return pages
  } finally {
    unfreeze()
    for (const close of closers.reverse()) await close().catch(() => undefined)
    await rm(base, { recursive: true, force: true })
  }
}
