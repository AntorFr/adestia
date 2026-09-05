/**
 * The workspace side: what counts as a source, what counts as a kept item,
 * and which paths a query string may reach.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { keyOf } from '../lib/feeds.mjs'
import { assetsFor, frontmatterOf, pagesOverDirs, readLibrary, readSources, safePath } from '../lib/library.mjs'

async function workspaceDir() {
  const root = await mkdtemp(join(tmpdir(), 'lp-pages-'))
  await mkdir(join(root, 'veille/assets'), { recursive: true })
  await mkdir(join(root, 'domaines/audio/assets'), { recursive: true })

  await writeFile(
    join(root, 'veille/assets/veille.json'),
    JSON.stringify({
      sources: [
        { id: 'underscore', titre: 'Underscore_', media: 'video', flux: 'https://f/1', tags: ['tech'] },
        { id: 'doublon', titre: 'Le même flux', flux: 'https://f/1' },
        { id: 'cassé', titre: 'pas une URL', flux: 'ftp://nope' },
      ],
    }),
  )
  await writeFile(
    join(root, 'domaines/audio/assets/veille.json'),
    JSON.stringify({ sources: [{ id: 'pod', titre: 'Le podcast', media: 'audio', flux: 'https://f/2' }] }),
  )

  await writeFile(
    join(root, 'veille/moteur-audio.md'),
    `---\ntitle: Le moteur audio\ntype: ecoute\nmedia: video\nurl: https://youtu.be/AAAAAAAAAAA?si=x\nsource: Underscore_\npublie: 2026-08-27\nduree: "18:42"\nstatus: à voir\ntags: [audio, synthese]\n---\n\nDes notes.\n`,
  )
  await writeFile(join(root, 'veille/assets/moteur-audio.transcript.txt'), '[00:00:01] on parle du filtre.\n')
  await writeFile(
    join(root, 'veille/episode-12.md'),
    `---\ntitle: Épisode 12\ntype: ecoute\nmedia: audio\nurl: https://exemple.fr/12\n---\n\nPas encore dépouillé.\n`,
  )
  await writeFile(join(root, 'veille/pas-une-ecoute.md'), `---\ntitle: Note\ntype: note\n---\n\nRien.\n`)
  return root
}

/** Le même corpus, servi comme le noyau le sert. */
const workspace = async () => pagesOverDirs([await workspaceDir()])

test('sources merge across files, and a feed declared twice is one source', async () => {
  const { sources, problems } = await readSources(await workspace())
  assert.deepEqual(
    sources.map((source) => source.id),
    ['pod', 'underscore'],
    'both files are read, in path order, and the duplicate feed is dropped',
  )
  assert.equal(sources.find((source) => source.id === 'pod').media, 'audio')
  assert.equal(sources[1].declaredIn, 'veille/assets/veille.json')
  assert.deepEqual(problems, [])
})

test('a sources file that will not parse is a problem, never a silence', async () => {
  const root = await workspaceDir()
  await writeFile(join(root, 'veille/assets/veille.json'), '{ nope')
  const { sources, problems } = await readSources(pagesOverDirs([root]))
  assert.equal(sources.length, 1, 'the other file still counts')
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'veille/assets/veille.json')
})

test('the library is every page typed ecoute, and nothing else', async () => {
  const items = await readLibrary(await workspace(), keyOf)
  assert.deepEqual(items.map((item) => item.path).sort(), [
    'veille/episode-12.md',
    'veille/moteur-audio.md',
  ])
})

test('an item carries the key of its url, so the queue can drop it', async () => {
  const items = await readLibrary(await workspace(), keyOf)
  const kept = items.find((item) => item.path === 'veille/moteur-audio.md')
  assert.equal(kept.key, 'yt:AAAAAAAAAAA')
  assert.equal(kept.duree, '18:42')
  assert.equal(kept.status, 'à voir')
  assert.deepEqual(kept.tags, ['audio', 'synthese'])
  assert.equal(kept.transcript, 'veille/assets/moteur-audio.transcript.txt')
})

test('an item with no transcript says so rather than pointing at a missing file', async () => {
  const items = await readLibrary(await workspace(), keyOf)
  assert.equal(items.find((item) => item.path === 'veille/episode-12.md').transcript, null)
})

test('assets are derived from the page name, wherever the page is filed', () => {
  assert.deepEqual(assetsFor('veille/moteur-audio.md'), {
    transcript: 'veille/assets/moteur-audio.transcript.txt',
    media: 'veille/assets/moteur-audio.media.json',
  })
  assert.deepEqual(assetsFor('domaines/audio/x.md'), {
    transcript: 'domaines/audio/assets/x.transcript.txt',
    media: 'domaines/audio/assets/x.media.json',
  })
})

test('frontmatter is read shallowly, and a page without one is not a crash', () => {
  assert.deepEqual(frontmatterOf('pas de frontmatter'), {})
  assert.deepEqual(frontmatterOf('---\ntitle: "Un titre"\ntags: [a, b]\n---\n'), {
    title: 'Un titre',
    tags: ['a', 'b'],
  })
  assert.deepEqual(frontmatterOf('---\ntags:\n  - a\n  - b\nstatus: fait\n---\n'), {
    tags: ['a', 'b'],
    status: 'fait',
  })
})

test('a path from a query string cannot leave the pages tree', () => {
  assert.equal(safePath('../../etc/passwd', { suffix: '.md' }), undefined)
  assert.equal(safePath('/etc/passwd', { suffix: '.md' }), undefined)
  assert.equal(safePath('veille/x.json', { suffix: '.md' }), undefined)
  assert.equal(safePath('veille/x.md', { suffix: '.md' }), 'veille/x.md')
})
