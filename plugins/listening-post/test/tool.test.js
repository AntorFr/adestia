/**
 * The agent's CLI, checked where it can be checked without a network and
 * without a transcriber: that it runs, that it answers JSON, and that a
 * missing `yt-dlp` is a SENTENCE rather than a stack trace.
 *
 * The transcription itself is not simulated here. Faking `yt-dlp` would test
 * the fake; what this file protects is the entry point every skill line
 * points at.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const TOOL = fileURLToPath(new URL('../tools/listening-post.mjs', import.meta.url))

const run = (args, options = {}) =>
  new Promise((done) => {
    execFile('node', [TOOL, ...args], { timeout: 30_000, ...options }, (error, stdout, stderr) =>
      done({ error, stdout: String(stdout), stderr: String(stderr) }),
    )
  })

async function corpus() {
  const root = await mkdtemp(join(tmpdir(), 'lp-tool-'))
  const pages = join(root, 'pages')
  await mkdir(join(pages, 'veille/assets'), { recursive: true })
  await writeFile(
    join(pages, 'veille/moteur-audio.md'),
    `---\ntitle: Le moteur audio\ntype: ecoute\nurl: https://www.youtube.com/watch?v=AAA\nsource: Underscore_\n---\n\nDes notes.\n`,
  )
  await writeFile(
    join(pages, 'veille/assets/moteur-audio.transcript.txt'),
    '[00:00:10] Le filtre passe-bas donne la couleur du son.\n[00:12:34] La résonance du filtre, poussée, se met à osciller.\n',
  )
  return { root, pages }
}

test('etat says what the instance has, and does not pretend to a transcriber', async () => {
  const { root, pages } = await corpus()
  const { error, stdout } = await run(['etat', '--pages', pages], { cwd: root })
  assert.equal(error, null, stdout)
  const answer = JSON.parse(stdout)
  assert.equal(answer.corpus.items, 1)
  assert.equal(answer.corpus.transcrits, 1)
  // Either yt-dlp is on this machine or it is not; both are legitimate, and
  // the shape of the answer must not depend on which.
  assert.ok(answer.transcripteur === null || typeof answer.transcripteur.version === 'string')
})

test('cherche finds where a subject was talked about, with a link that seeks', async () => {
  const { root, pages } = await corpus()
  const { error, stdout } = await run(['cherche', 'résonance filtre', '--pages', pages], { cwd: root })
  assert.equal(error, null, stdout)
  const answer = JSON.parse(stdout)
  assert.equal(answer.resultats.length, 1)
  const [hit] = answer.resultats
  assert.equal(hit.titre, 'Le moteur audio')
  assert.match(hit.passages[0].lien, /watch\?v=AAA&t=\d+s/)
  assert.match(hit.passages[0].a, /^\d{2}:\d{2}:\d{2}$/)
})

test('a search that finds nothing says how much of the corpus it read', async () => {
  const { root, pages } = await corpus()
  const { stdout } = await run(['cherche', 'chalutier norvégien', '--pages', pages], { cwd: root })
  const answer = JSON.parse(stdout)
  assert.deepEqual(answer.resultats, [])
  assert.deepEqual(answer.corpus, { items: 1, transcrits: 1 })
})

test('a command nobody knows prints its usage rather than doing something', async () => {
  const { error, stderr } = await run(['transcode'])
  assert.ok(error, 'and exits non-zero')
  assert.match(stderr, /transcris/)
})
