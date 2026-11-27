/**
 * `adestia-dossiers-pieces-jointes` (B-38, P-22 step 2, AD-41), the effect at its door, written from the need only:
 * the criterion of the sheet (amended 2026-11-20), docs/parcours.md (B-38), docs/donnees.md (AD-41).
 * A REAL instance (`start()`, real routes, real stores on disk, the repository's real `plugins/` directory, the
 * `voyages` plugin active as the bench has it) driven over HTTP: `GET /api/files?folder=<folder>`.
 * The expectations are literals written by hand. What the user sees (E-3) is in
 * `besoin-dossiers-pieces-jointes-ecran-ensemble.test.ts`.
 *
 * Plan (need -> case -> proof):
 *   B-38 nominal    folder with a PDF, two photos (one in assets/), assets/voyage.json, a page, .folder.md, voyages
 *                   active -> the PDF and the two photos, nothing else
 *          bords    a folder holding only assets/voyage.json -> [], only a page -> [], an empty folder -> []
 *                   a voyage.json AT THE ROOT stays an attachment (AD-41 as amended), also with voyages active
 *                   a deeper `assets/` (sub/assets/...) and sub-folder files are not the folder's attachments
 *                   a folder held by two stores lists the files of both
 *                   voyages not active -> assets/voyage.json is an attachment
 *          échec    unknown folder, `..` traversal, a plumbing folder -> {files: []}
 *          exclusion `.md` pages and `.folder.md` never listed; a person's other .json stays listed
 *   B-38 manifest   `dataFiles` malformed (a string, a number inside a list, an object) -> the plugin is
 *                   refused (pluginProblems), a well-formed one is loaded
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { type StartedInstance, start } from '../src/start.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const BUNDLED = fileURLToPath(new URL('../../../plugins', import.meta.url))

let instance: StartedInstance | undefined
afterEach(async () => {
  await instance?.close()
  instance = undefined
  await cleanTmp()
})

async function put(path: string, text = 'x') {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text)
}

interface Boot {
  readonly voyages?: boolean
  readonly second?: boolean
  readonly pluginsDir?: string
  readonly apps?: string[]
}
/** Boots an instance; returns the main store's pages directory and the second store's. */
async function boot(options: Boot = {}, before?: (dirs: { pages: string; other: string }) => Promise<void>) {
  const root = await tmpDir('adestia-pj-')
  const pages = join(root, 'workspace', 'pages')
  const other = join(root, 'workspace', 'autre')
  await mkdir(pages, { recursive: true })
  await mkdir(other, { recursive: true })
  await before?.({ pages, other })
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  const apps = options.apps ?? (options.voyages === false ? [] : ['voyages'])
  const stores = options.second
    ? `  stores:\n    - id: perso\n      path: pages\n      default: true\n    - id: autre\n      path: autre\n`
    : ''
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\n${stores}driver:\n  id: claude-code\n  command: ${idle}\nextensions:\n  pluginsDir: ${options.pluginsDir ?? BUNDLED}\n  apps: [${apps.join(', ')}]\n`,
  )
  instance = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
  return { pages, other, root }
}

async function files(folder: string): Promise<string[]> {
  const res = await fetch(new URL(`/api/files?folder=${encodeURIComponent(folder)}`, instance!.url))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { files: { path: string; name: string; kind: string; bytes: number }[] }
  return body.files.map((f) => f.path).sort()
}

const seedSejour = async ({ pages }: { pages: string }) => {
  await put(join(pages, 'sejour', 'note.md'), '---\ntitle: Note\n---\n\nTexte.\n')
  await put(join(pages, 'sejour', '.folder.md'), '---\nattachments: true\n---\n')
  await put(join(pages, 'sejour', 'billet.pdf'), '%PDF-1.4\n')
  await put(join(pages, 'sejour', 'photo-une.png'), 'png')
  await put(join(pages, 'sejour', 'assets', 'photo-deux.png'), 'png')
  await put(join(pages, 'sejour', 'assets', 'voyage.json'), '{"titre":"X"}')
}

describe('B-38 GET /api/files?folder= with the voyages plugin active', () => {
  it('lists the PDF and the two photos, and neither assets/voyage.json, .folder.md nor the page', async () => {
    // red if a data file, the settings file or a page leaks into the list, or a direct file / an assets file is missing
    await boot({}, seedSejour)
    expect(await files('sejour')).toEqual(['sejour/assets/photo-deux.png', 'sejour/billet.pdf', 'sejour/photo-une.png'])
  })

  it('shapes each file with its name, its kind and its size', async () => {
    // red if the rows cannot be drawn like the attachments of a page
    await boot({}, seedSejour)
    const res = await fetch(new URL('/api/files?folder=sejour', instance!.url))
    const body = (await res.json()) as { files: Record<string, unknown>[] }
    const pdf = body.files.find((f) => f['path'] === 'sejour/billet.pdf')
    expect(pdf).toMatchObject({ name: 'billet.pdf', kind: 'pdf', bytes: 9 })
  })

  it('a folder holding only assets/voyage.json lists nothing', async () => {
    await boot({}, async ({ pages }) => {
      await put(join(pages, 'donnees', 'assets', 'voyage.json'), '{}')
      await put(join(pages, 'donnees', 'note.md'), '# N')
    })
    expect(await files('donnees')).toEqual([])
  })

  it('a folder holding only pages lists nothing, an empty folder lists nothing', async () => {
    await boot({}, async ({ pages }) => {
      await put(join(pages, 'textes', 'a.md'), '# A')
      await put(join(pages, 'textes', 'b.md'), '# B')
      await mkdir(join(pages, 'vide'), { recursive: true })
    })
    expect(await files('textes')).toEqual([])
    expect(await files('vide')).toEqual([])
  })

  it('a voyage.json at the ROOT of the folder stays an attachment (AD-41 as amended)', async () => {
    // red if the data file is matched by its bare name instead of its path inside the folder
    await boot({}, async ({ pages }) => {
      await put(join(pages, 'racine', 'voyage.json'), '{}')
      await put(join(pages, 'racine', 'assets', 'voyage.json'), '{}')
      await put(join(pages, 'racine', 'billet.pdf'), 'pdf')
    })
    expect(await files('racine')).toEqual(['racine/billet.pdf', 'racine/voyage.json'])
  })

  it('a person\'s other .json file, in the folder or in assets/, is an attachment', async () => {
    // red if every .json is hidden (ARCHITECTURE rejected that)
    await boot({}, async ({ pages }) => {
      await put(join(pages, 'perso', 'donnees.json'), '{}')
      await put(join(pages, 'perso', 'assets', 'autre.json'), '{}')
      await put(join(pages, 'perso', 'assets', 'voyage.json'), '{}')
    })
    expect(await files('perso')).toEqual(['perso/assets/autre.json', 'perso/donnees.json'])
  })

  it('lists neither the files of a sub-folder nor the assets/ of a sub-folder', async () => {
    // the criterion says: direct files and assets/ of the folder
    await boot({}, async ({ pages }) => {
      await put(join(pages, 'haut', 'a.pdf'), 'pdf')
      await put(join(pages, 'haut', 'sous', 'profond.pdf'), 'pdf')
      await put(join(pages, 'haut', 'sous', 'assets', 'plus-profond.png'), 'png')
    })
    expect(await files('haut')).toEqual(['haut/a.pdf'])
  })

  it('answers the same for the folder written with surrounding slashes', async () => {
    await boot({}, seedSejour)
    expect(await files('/sejour/')).toEqual(['sejour/assets/photo-deux.png', 'sejour/billet.pdf', 'sejour/photo-une.png'])
  })

  it('a folder held by two stores lists the files of both, and the data file of neither', async () => {
    await boot({ second: true }, async ({ pages, other }) => {
      await put(join(pages, 'partage', 'a.pdf'), 'pdf')
      await put(join(pages, 'partage', 'assets', 'voyage.json'), '{}')
      await put(join(other, 'partage', 'b.png'), 'png')
      await put(join(other, 'partage', 'assets', 'voyage.json'), '{}')
    })
    expect(await files('partage')).toEqual(['partage/a.pdf', 'partage/b.png'])
  })

  it('an unknown folder, a traversal and a plumbing folder answer no file', async () => {
    await boot({}, seedSejour)
    expect(await files('nulle-part')).toEqual([])
    expect(await files('../../etc')).toEqual([])
    expect(await files('sejour/../../..')).toEqual([])
    expect(await files('.git')).toEqual([])
  })
})

describe('B-38 with the voyages plugin NOT active', () => {
  it('assets/voyage.json is an ordinary attachment, .folder.md and pages still are not', async () => {
    // red if the data file is excluded whatever the plugin state
    await boot({ voyages: false }, seedSejour)
    expect(await files('sejour')).toEqual([
      'sejour/assets/photo-deux.png',
      'sejour/assets/voyage.json',
      'sejour/billet.pdf',
      'sejour/photo-une.png',
    ])
  })
})

describe('B-38 a manifest whose dataFiles is malformed refuses the plugin', () => {
  const manifest = (dataFiles: unknown) => ({
    schemaVersion: 1,
    id: 'donnees',
    kind: 'app',
    description: 'Un plugin de test.',
    contract: 1,
    ...(dataFiles === undefined ? {} : { dataFiles }),
  })
  async function withPlugin(dataFiles: unknown) {
    const dir = await tmpDir('adestia-pj-plugins-')
    await put(join(dir, 'donnees', 'adestia-plugin.json'), JSON.stringify(manifest(dataFiles)))
    const { pages } = await boot({ pluginsDir: dir, apps: ['donnees'] }, async ({ pages: p }) => {
      await put(join(p, 'x', 'assets', 'mes.donnees'), 'd')
      await put(join(p, 'x', 'a.pdf'), 'pdf')
    })
    void pages
    const info = (await (await fetch(new URL('/api/instance', instance!.url))).json()) as {
      plugins: { id: string }[]
      pluginProblems: { id: string; reason: string }[]
    }
    return info
  }

  it('a well-formed list loads the plugin and hides what it declares', async () => {
    const info = await withPlugin(['assets/mes.donnees'])
    expect(info.plugins.map((p) => p.id)).toEqual(['donnees'])
    expect(info.pluginProblems).toEqual([])
    expect(await files('x')).toEqual(['x/a.pdf'])
  })

  it('a manifest without dataFiles loads, and hides nothing', async () => {
    const info = await withPlugin(undefined)
    expect(info.plugins.map((p) => p.id)).toEqual(['donnees'])
    expect(await files('x')).toEqual(['x/a.pdf', 'x/assets/mes.donnees'])
  })

  const bad: [string, unknown][] = [
    ['a string', 'assets/voyage.json'],
    ['an object', { a: 'assets/voyage.json' }],
    ['a number', 3],
    ['a list holding a number', ['assets/voyage.json', 3]],
    ['a list holding an object', [{ path: 'a' }]],
  ]
  for (const [name, value] of bad) {
    it(`refuses the plugin when dataFiles is ${name}`, async () => {
      // red if a malformed dataFiles is accepted or silently ignored
      const info = await withPlugin(value)
      expect(info.plugins.map((p) => p.id)).toEqual([])
      expect(info.pluginProblems.map((p) => p.id)).toEqual(['donnees'])
      expect(info.pluginProblems[0]?.reason.length).toBeGreaterThan(0)
    })
  }
})
