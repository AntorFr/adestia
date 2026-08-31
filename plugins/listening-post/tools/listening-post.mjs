#!/usr/bin/env node
/**
 * The agent's half of the listening post.
 *
 * Everything the browser cannot do: run the transcriber, read the whole
 * corpus, and answer a question over what was said. It writes ONLY the two
 * asset files beside a page — the transcript and the metadata — and never the
 * page itself: what a video is worth, and what is worth remembering from it,
 * is a judgement, and a judgement belongs to whoever is writing the page.
 *
 *   node <plugin>/tools/listening-post.mjs transcris <url> --page pages/veille/x.md
 *   node <plugin>/tools/listening-post.mjs cherche "moteur audio" [--n 8]
 *   node <plugin>/tools/listening-post.mjs flux [--jours 7]
 *   node <plugin>/tools/listening-post.mjs etat
 *
 * Paths are relative to the WORKSPACE, which is where the agent runs — so a
 * page is `pages/veille/x.md`, spelled the way the file tools spell it, not
 * the way the page API does.
 *
 * ⚠️ `transcris` needs `yt-dlp` on the PATH. Without it the command says so
 * and exits non-zero rather than writing an empty transcript: a file of
 * silence would be indistinguishable from an episode where nothing was said.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { byFreshness, clockOf, deepLink, keyOf, parseFeed } from '../lib/feeds.mjs'
import { assetsFor, readLibrary, readSources } from '../lib/library.mjs'
import { formatTranscript, parseCaptions, parseTranscript, search, toStamp } from '../lib/transcript.mjs'

const TRANSCRIBE_TIMEOUT = 600_000

function usage(code = 1) {
  process.stderr.write(
    [
      'listening-post — la veille vidéo/audio',
      '',
      '  transcris <url> --page <chemin.md>   sous-titres → assets/<slug>.transcript.txt',
      '  cherche "<sujet>" [--n 8]            où ça a été dit, dans tout le corpus',
      '  flux [--jours 7]                     ce que les sources ont publié récemment',
      '  etat                                 transcripteur, corpus, sources',
      '',
      '  --pages <dossier>   le dossier des pages (défaut: pages)',
      '',
    ].join('\n'),
  )
  process.exit(code)
}

/** `--flag value` and `--flag=value`, plus the bare arguments, in one pass. */
function parseArgs(argv) {
  const flags = {}
  const bare = []
  for (let index = 0; index < argv.length; index += 1) {
    const piece = argv[index]
    if (!piece.startsWith('--')) {
      bare.push(piece)
      continue
    }
    const [name, inline] = piece.slice(2).split(/=(.*)/s)
    if (inline !== undefined) flags[name] = inline
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) flags[name] = argv[(index += 1)]
    else flags[name] = true
  }
  return { flags, bare }
}

const run = (command, args, options = {}) =>
  new Promise((done) => {
    const child = execFile(command, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (error, stdout, stderr) =>
      done({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error }),
    )
    // `error` on the process itself (ENOENT) never reaches the callback on
    // some platforms; catching it here is what turns "yt-dlp is not
    // installed" into a sentence rather than an unhandled rejection.
    child.on('error', () => {})
  })

const say = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

async function transcriberVersion() {
  const answer = await run('yt-dlp', ['--version'], { timeout: 10_000 })
  return answer.ok ? answer.stdout.trim() : null
}

/**
 * The subtitles a platform already has, turned into this plugin's transcript.
 *
 * Manual captions where they exist, automatic ones otherwise, and NOTHING
 * invented in between: an episode with no published captions comes back with
 * `transcript: null` and a reason. Nobody's notes should be built on a
 * transcript that was guessed.
 */
async function transcris(url, { pageArg, pagesDir, langs }) {
  const version = await transcriberVersion()
  if (!version) {
    say({
      ok: false,
      raison: "yt-dlp n'est pas installé sur cette instance",
      quoiFaire:
        "Ajoute-le à l'image (ou au PATH de l'instance) — sans lui, la veille marche mais rien ne se transcrit.",
    })
    process.exit(2)
  }

  const meta = await run('yt-dlp', ['-J', '--no-playlist', '--skip-download', url], {
    timeout: TRANSCRIBE_TIMEOUT,
  })
  if (!meta.ok) {
    say({ ok: false, raison: 'yt-dlp ne sait pas lire cette URL', detail: meta.stderr.trim().slice(-600) })
    process.exit(3)
  }

  let info
  try {
    info = JSON.parse(meta.stdout)
  } catch {
    say({ ok: false, raison: 'réponse illisible de yt-dlp' })
    process.exit(3)
  }

  const work = await mkdtemp(join(tmpdir(), 'listening-post-'))
  let lines = []
  let langue = null
  try {
    const wrote = await run(
      'yt-dlp',
      [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        langs,
        '--sub-format',
        'vtt',
        '--convert-subs',
        'vtt',
        '--no-playlist',
        '-o',
        join(work, '%(id)s.%(ext)s'),
        url,
      ],
      { timeout: TRANSCRIBE_TIMEOUT },
    )
    const files = wrote.ok ? (await readdir(work)).filter((name) => name.endsWith('.vtt')) : []
    // Preference order is the order of `--sub-langs`: a French video with an
    // English auto-translation must not come back in English.
    const wanted = langs.split(',').map((tag) => tag.trim().replace(/\..*$/, ''))
    const chosen =
      files.find((name) => wanted.some((tag) => name.includes(`.${tag}`) && !name.includes('-orig'))) ??
      files[0]
    if (chosen) {
      langue = /\.([a-z]{2}(?:-[A-Za-z]+)?)\.vtt$/.exec(chosen)?.[1] ?? null
      lines = parseCaptions(await readFile(join(work, chosen), 'utf8'))
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }

  const chapitres = (info.chapters ?? [])
    .map((chapter) => ({ t: Math.floor(chapter.start_time ?? 0), titre: String(chapter.title ?? '').trim() }))
    .filter((chapter) => chapter.titre)

  const fiche = {
    url: info.webpage_url ?? url,
    key: keyOf(info.webpage_url ?? url),
    titre: info.title ?? url,
    source: info.uploader ?? info.channel ?? info.playlist_title ?? null,
    media: info.vcodec && info.vcodec !== 'none' ? 'video' : 'audio',
    publie: info.upload_date ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}` : null,
    secondes: Number.isFinite(info.duration) ? Math.round(info.duration) : null,
    duree: clockOf(info.duration),
    langue,
    chapitres,
    description: String(info.description ?? '').slice(0, 4000),
    transcritLe: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    lignes: lines.length,
  }

  // Where the two files go. `--page` is the page they belong to; without one
  // the caller gets them beside the current directory and files them itself.
  const page = typeof pageArg === 'string' ? pageArg : null
  const slug = page ? basename(page).replace(/\.md$/i, '') : (info.id ?? 'media')
  const folder = page ? join(dirname(page), 'assets') : join(pagesDir, 'assets')
  await mkdir(folder, { recursive: true })

  const transcriptPath = join(folder, `${slug}.transcript.txt`)
  const metaPath = join(folder, `${slug}.media.json`)
  if (lines.length > 0) {
    await writeFile(transcriptPath, formatTranscript(lines))
  }
  await writeFile(metaPath, `${JSON.stringify(fiche, null, 1)}\n`)

  say({
    ok: true,
    ...fiche,
    // The two paths, so the page that gets written can reference them without
    // re-deriving a convention.
    transcript: lines.length > 0 ? transcriptPath : null,
    meta: metaPath,
    raison: lines.length > 0 ? null : "aucun sous-titre publié pour ce média — description et chapitres seuls",
    // A first look, so the caller knows what it is holding before reading the
    // whole file: the opening, and every chapter.
    debut: lines.slice(0, 3).map((line) => `[${toStamp(line.t)}] ${line.text}`),
  })
}

async function cherche(query, { pagesDir, n }) {
  const library = await readLibrary(pagesDir, keyOf)
  const results = []
  for (const item of library) {
    if (!item.transcript) continue
    let lines
    try {
      lines = parseTranscript(await readFile(join(pagesDir, item.transcript), 'utf8'))
    } catch {
      continue
    }
    const hits = search(lines, query, { limit: 4 })
    if (hits.length === 0) continue
    results.push({
      page: join(pagesDir, item.path),
      titre: item.titre,
      source: item.source,
      publie: item.publie,
      score: hits.reduce((total, hit) => total + hit.score, 0),
      passages: hits.map((hit) => ({ a: toStamp(hit.t), lien: deepLink(item.url, hit.t), texte: hit.text })),
    })
  }
  results.sort((a, b) => b.score - a.score)
  say({
    query,
    resultats: results.slice(0, n),
    corpus: { items: library.length, transcrits: library.filter((item) => item.transcript).length },
  })
}

async function flux({ pagesDir, jours }) {
  const { sources, problems } = await readSources(pagesDir)
  const library = await readLibrary(pagesDir, keyOf)
  const filed = new Set(library.map((item) => item.key).filter(Boolean))
  const since = Date.now() - jours * 86_400_000

  const entries = []
  const etat = []
  for (const source of sources) {
    try {
      const response = await fetch(source.flux, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) {
        etat.push({ id: source.id, ok: false, error: `HTTP ${response.status}` })
        continue
      }
      const parsed = parseFeed(await response.text(), source)
      etat.push({ id: source.id, ok: true, count: parsed.length })
      entries.push(...parsed)
    } catch (error) {
      etat.push({ id: source.id, ok: false, error: error.message })
    }
  }

  const fresh = entries
    .filter((entry) => !filed.has(entry.key))
    .filter((entry) => !entry.publie || Date.parse(entry.publie) >= since)
    .sort(byFreshness)

  say({
    depuis: `${jours} j`,
    // Said out loud: a short list because two feeds timed out is not a quiet
    // week, and only this line tells them apart.
    sources: etat,
    problems,
    nouveautes: fresh.map((entry) => ({
      titre: entry.titre,
      source: entry.source,
      media: entry.media,
      publie: entry.publie,
      duree: clockOf(entry.secondes),
      tags: entry.tags,
      url: entry.url,
      resume: entry.resume?.slice(0, 240) ?? '',
    })),
    // What this command CANNOT see: the queue's own dismissals live in the
    // instance's data directory, which the agent has no path to. Something
    // waved away in the screen may still appear here.
    note: "les écartés de l'écran ne sont pas visibles ici",
  })
}

async function etat({ pagesDir }) {
  const version = await transcriberVersion()
  const { sources, problems } = await readSources(pagesDir)
  const library = await readLibrary(pagesDir, keyOf)
  say({
    transcripteur: version ? { nom: 'yt-dlp', version } : null,
    pages: pagesDir,
    sources: sources.map((source) => ({ id: source.id, media: source.media, declaredIn: source.declaredIn })),
    problems,
    corpus: {
      items: library.length,
      transcrits: library.filter((item) => item.transcript).length,
      aVoir: library.filter((item) => !/^(fait|clos|vu|terminé|termine)$/i.test(String(item.status ?? ''))).length,
    },
    assets: assetsFor('pages/veille/exemple.md'),
  })
}

const { flags, bare } = parseArgs(process.argv.slice(2))
const [command, ...rest] = bare
const pagesDir = typeof flags.pages === 'string' ? flags.pages : 'pages'

switch (command) {
  case 'transcris':
    if (!rest[0]) usage()
    await transcris(rest[0], {
      pageArg: flags.page,
      pagesDir,
      langs: typeof flags.langs === 'string' ? flags.langs : 'fr,fr-FR,fr-orig,en,en-US',
    })
    break
  case 'cherche':
    if (!rest[0]) usage()
    await cherche(rest.join(' '), { pagesDir, n: Number(flags.n) || 8 })
    break
  case 'flux':
    await flux({ pagesDir, jours: Number(flags.jours) || 7 })
    break
  case 'etat':
    await etat({ pagesDir })
    break
  default:
    usage(command ? 1 : 0)
}
