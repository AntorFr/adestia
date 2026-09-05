/**
 * The witness: what a SINGLE-store instance answers, byte for byte.
 *
 * Memory is about to stop being one directory and become a composition of
 * several. A domain will not be filed IN a store — it will be the union of what
 * each store carries — and the union of a one-element set is that set. So an
 * instance with one store must answer exactly what it answers today: same
 * fields, same order, same paths, same bytes.
 *
 * That is not a hope, it is a diff. These goldens are captured on the code that
 * has no stores yet, and the composer is written afterwards. Captured the other
 * way round they would record whatever the composer does — bugs included — and
 * the test would only say "identical to myself".
 *
 * It catches precisely what a hand-written assertion does not, because nobody
 * thinks to assert it: a `store` field slipping into the mono case, a sort
 * that became a directory-walk order, a path that gained a `./`. Invisible on
 * reading, immediate in a diff.
 *
 * Regenerate deliberately, never to make a red test green:
 *
 *     UPDATE_WITNESS=1 npx vitest run packages/server/test/mono-store-witness.test.ts
 */

import { mkdtemp, mkdir, writeFile, utimes, readdir } from 'node:fs/promises'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { registerPages } from '../src/pages.js'
import { resolveStores } from '../src/stores.js'
import { registerFiles } from '../src/files.js'

const witnessDir = join(dirname(fileURLToPath(import.meta.url)), 'witness')

/**
 * One fixed instant for every file.
 *
 * `modified` and `revision` are derived from mtime, and git does not preserve
 * mtimes — a golden taken without this would be a golden that fails on the
 * next clone, which is how a genuine guard gets deleted for being flaky.
 */
const STAMP = new Date('2026-01-02T03:04:05.000Z')

/**
 * A corpus shaped around what could silently drift, not around what is
 * pretty: nesting, both spellings of an index, every frontmatter scalar, the
 * three ways a title is found, sort order across case and accents, the
 * attachment convention, and the things that must stay OUT.
 */
const FILES: readonly (readonly [string, string])[] = [
  ['home/brief.json', '{\n  "items": [\n    { "titre": "Le meuble", "cible": "domaines/diy/projets/etabli.md" }\n  ]\n}\n'],

  // Title from frontmatter, and every scalar shape the index parses.
  ['domaines/diy/INDEX.md', '---\ntitle: "L\'Atelier"\ntype: index\nstatus: permanent\nico: 🪚\ntags: [bois, outil]\nannee: 2026\nouvert: true\nvide: ""\nrien: null\ndate: 2026-08-21\n---\n\n# Autre titre\n\nCorps.\n'],
  // The sibling shell's "space": a folder and a page of the same name.
  ['domaines/diy/projets/projets.md', '---\ntitle: Projets\ntype: index\n---\n\nCorps.\n'],
  // Title from the first heading — no frontmatter title.
  ['domaines/diy/projets/etabli.md', '---\ntype: projet\nstatus: en cours\n---\n\n# Établi du fond de l\'atelier\n\nCorps.\n'],
  // Title from the file name — no frontmatter, no heading.
  ['domaines/diy/projets/rangement.md', 'Juste du texte.\n'],
  // A finished page: the engine's verdict travels in the index.
  ['domaines/diy/projets/dressing.md', '---\ntitle: Dressing\ntype: projet\nstatus: réalisé\n---\n\nCorps.\n'],
  // Sort order: case, accents, digits.
  ['domaines/diy/projets/Ébène.md', '---\ntitle: Ébène\n---\n\nCorps.\n'],
  ['domaines/diy/projets/zinc.md', '---\ntitle: Zinc\n---\n\nCorps.\n'],
  ['domaines/diy/projets/Aulne.md', '---\ntitle: Aulne\n---\n\nCorps.\n'],

  // Attachments: beside the page, and under its assets/.
  ['domaines/diy/projets/plan.pdf', 'PDF'],
  ['domaines/diy/projets/assets/avant.jpg', 'JPG'],
  ['domaines/diy/projets/assets/nested/detail.png', 'PNG'],
  // A file belonging to a DIFFERENT page's folder: must not surface as this
  // page's attachment.
  ['domaines/diy/machines/notice.pdf', 'PDF'],

  // Must stay out of every answer.
  ['.git/config', 'secret'],
  ['domaines/diy/.claude/settings.json', '{}'],
  // Le fichier de travail d'une sauvegarde, tel que le serveur l'écrit
  // AUJOURD'HUI : un point devant, donc invisible comme `.git`.
  ['domaines/diy/projets/.etabli.md.7f3a.tmp', 'partial'],
  // Le même, tel qu'une version ANTÉRIEURE le laissait derrière elle après un
  // processus tué. Il reste listé comme pièce jointe, et le témoin l'épingle :
  // le point protège les sauvegardes à venir, il ne balaie pas les résidus.
  ['domaines/diy/projets/etabli.md.old-residue.tmp', 'partial'],
]

let app: FastifyInstance

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'adestia-witness-'))
  for (const [path, content] of FILES) {
    await mkdir(join(root, dirname(path)), { recursive: true })
    await writeFile(join(root, path), content, 'utf8')
  }
  const stampAll = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await stampAll(full)
      await utimes(full, STAMP, STAMP)
    }
  }
  await stampAll(root)

  // Exactly what an instance that never heard of stores gets: one store,
  // built from `workspace.pages`, the default by default.
  const { stores } = resolveStores([{ id: 'perso', path: root }], root)

  app = Fastify()
  // Named, never inherited: the golden must not depend on the machine's own
  // language settings.
  registerPages(app, { stores, locale: 'fr' })
  registerFiles(app, { stores, locale: 'fr' })
  await app.ready()
})

/** The five answers the composer will rewrite. */
const ROUTES: readonly (readonly [string, string])[] = [
  ['pages', '/api/pages'],
  ['pages-index', '/api/pages/index'],
  ['files-under', '/api/files?under=domaines/diy'],
  ['files-page', '/api/files?page=domaines/diy/projets/etabli.md'],
  ['home-brief', '/api/home/brief'],
]

describe('a single-store instance answers exactly what it answered before', () => {
  for (const [name, url] of ROUTES) {
    it(`${url} is unchanged, byte for byte`, async () => {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(200)

      const file = join(witnessDir, `${name}.json`)
      if (process.env['UPDATE_WITNESS'] === '1') {
        if (!existsSync(witnessDir)) mkdirSync(witnessDir, { recursive: true })
        writeFileSync(file, response.body, 'utf8')
      }
      expect(response.body).toBe(readFileSync(file, 'utf8'))
    })
  }
})
