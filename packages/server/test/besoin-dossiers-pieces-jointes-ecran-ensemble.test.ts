/**
 * `adestia-dossiers-pieces-jointes`, E-3 (the folder view) and its Attachments brick (B-38), written from the need only:
 * a REAL instance with the `voyages` plugin active, the built web shell, a driven Chromium. For each gesture the test
 * waits for the answer of `GET /api/files?folder=` and then checks what the screen shows. The effects themselves
 * (what the route lists) are in `besoin-dossiers-pieces-jointes-ensemble.test.ts`.
 *
 * Plan (E-3):
 *   nominal   PDF + two photos (one in assets/) + assets/voyage.json + .folder.md: heading « Attachments 3 », three rows,
 *             no voyage.json, no .folder.md; clicking the PDF opens /api/files/<path> in a new tab; captures light/dark, desk/phone
 *   bords     `attachments: false` -> no brick; only a data file -> no brick; thirteen files -> twelve rows then
 *             « Show all 13 » shows all thirteen; a voyage.json at the root of the folder is a row
 *   échec     the files route fails (500) -> no brick, no error frame, the page cards still there
 *
 * Needs the built shell (`npm run build`) and Playwright with Chromium; without them the file SKIPS and says why.
 * Captures go to $ADESTIA_SHOTS or the OS temp directory, never the tree.
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

import { type StartedInstance, start } from '../src/start.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const requireFrom = createRequire(import.meta.url)
function loadPlaywright(): any {
  for (const base of [undefined, '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try {
      return base === undefined ? requireFrom('playwright') : createRequire(`${base}/`)('playwright')
    } catch {
      /* next */
    }
  }
  return undefined
}
const playwright = loadPlaywright()
const shellBuilt = existsSync(new URL('../../web/dist-web/index.html', import.meta.url))
const canDrive = playwright !== undefined && shellBuilt
const SKIP_REASON = `${playwright === undefined ? 'no playwright ' : ''}${shellBuilt ? '' : 'no built web shell'}`
const BUNDLED = fileURLToPath(new URL('../../../plugins', import.meta.url))
const shots = process.env['ADESTIA_SHOTS'] ?? join(tmpdir(), 'adestia-pj-shots')

let instance: StartedInstance | undefined
let browser: any
beforeAll(async () => {
  if (canDrive) browser = await playwright.chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})
afterEach(async () => {
  await instance?.close()
  instance = undefined
  await cleanTmp()
})

async function put(path: string, text: string | Buffer = 'x') {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, text)
}
const note = (title: string) => `---\ntitle: ${title}\n---\n\nTexte.\n`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
)

async function boot(seed: (pages: string) => Promise<void>) {
  const root = await tmpDir('adestia-pj-ecran-')
  const pages = join(root, 'workspace', 'pages')
  await mkdir(pages, { recursive: true })
  await seed(pages)
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\ndriver:\n  id: claude-code\n  command: ${idle}\nextensions:\n  pluginsDir: ${BUNDLED}\n  apps: [voyages]\n`,
  )
  instance = await start({
    cwd: root,
    configPath: 'adestia.config.yaml',
    webRoot: fileURLToPath(new URL('../../web/dist-web/', import.meta.url)),
    log: () => undefined,
  })
}

async function open(folder: string, options: { width?: number; scheme?: 'light' | 'dark'; failFiles?: boolean; noRequest?: boolean } = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: 900 },
    colorScheme: options.scheme ?? 'light',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  if (options.failFiles) await page.route('**/api/files?folder=*', (route: any) => route.fulfill({ status: 500, body: 'boom' }))
  const answered = page.waitForResponse((r: any) => r.url().includes(`/api/files?folder=${encodeURIComponent(folder)}`))
  await page.goto(`${instance!.url}#/section/${folder}`)
  if (options.noRequest) answered.catch(() => undefined)
  else await answered
  return page
}
const heading = (page: any) => page.getByRole('heading', { name: /^Attachments/ })
const shot = async (page: any, name: string) => {
  await mkdir(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

describe.skipIf(!canDrive)(`E-3 Attachments brick${canDrive ? '' : ` (SKIPPED: ${SKIP_REASON})`}`, () => {
  const sejour = async (pages: string) => {
    await put(join(pages, 'sejour', 'note.md'), note('Note du séjour'))
    await put(join(pages, 'sejour', '.folder.md'), '---\nattachments: true\n---\n')
    await put(join(pages, 'sejour', 'billet.pdf'), '%PDF-1.4\n% billet\n')
    await put(join(pages, 'sejour', 'photo-une.png'), PNG)
    await put(join(pages, 'sejour', 'assets', 'photo-deux.png'), PNG)
    await put(join(pages, 'sejour', 'assets', 'voyage.json'), '{"titre":"X","lieux":[],"items":[]}')
  }

  /** The same folder without the data file: not claimed by the Trips plugin's screen, so E-3 draws it. */
  const complet = async (pages: string) => {
    await put(join(pages, 'complet', 'note.md'), note('Note du séjour'))
    await put(join(pages, 'complet', '.folder.md'), '---\nattachments: true\n---\n')
    await put(join(pages, 'complet', 'billet.pdf'), '%PDF-1.4\n% billet\n')
    await put(join(pages, 'complet', 'photo-une.png'), PNG)
    await put(join(pages, 'complet', 'assets', 'photo-deux.png'), PNG)
  }

  it('a folder with a PDF, two photos and assets/voyage.json shows the brick with three rows, not the data file nor .folder.md', async () => {
    // red if the brick is missing, counts the data file or the settings file, or lists a wrong number of rows
    await boot(sejour)
    const page = await open('sejour', { noRequest: true })
    await heading(page).or(page.getByText('Trips', { exact: true }).first()).first().waitFor()
    // what the user lands on: E-3 of the folder, not another screen
    expect(new URL(page.url()).hash).toBe('#/section/sejour')
    await heading(page).waitFor({ timeout: 3000 })
    expect((await heading(page).textContent())!.replace(/\s+/g, ' ').trim()).toBe('Attachments 3')
    const body = await page.locator('body').innerText()
    expect(body).toContain('billet.pdf')
    expect(body).toContain('photo-une.png')
    expect(body).toContain('photo-deux.png')
    expect(body).not.toContain('voyage.json')
    expect(body).not.toContain('.folder.md')
    expect(await page.getByText('Note du séjour').count()).toBe(1)
  })

  it('a folder with a PDF and two photos shows the brick with three rows (captures light/dark, desk/phone)', async () => {
    // red if the brick is missing or counts a wrong number of rows
    await boot(complet)
    for (const [width, scheme] of [[1280, 'light'], [1280, 'dark'], [390, 'light'], [390, 'dark']] as const) {
      const p = await open('complet', { width, scheme })
      await heading(p).waitFor()
      expect((await heading(p).textContent())!.replace(/\s+/g, ' ').trim()).toBe('Attachments 3')
      expect(await p.locator('.adestia-folder-files li').count()).toBe(3)
      if (width < 600) await p.getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).first().click()
      await heading(p).waitFor({ state: 'visible' })
      await p.waitForTimeout(1000) // the panel slides in; the picture is a proof of the moment, not an assertion
      await shot(p, `e3-${width === 1280 ? 'desk' : 'phone'}-${scheme}`)
      await p.context().close()
    }
  })

  it('clicking the PDF opens the file in a new tab from /api/files/', async () => {
    // red if the row is not a link to the file route
    await boot(complet)
    const page = await open('complet')
    await heading(page).waitFor()
    const [popup] = await Promise.all([page.context().waitForEvent('page'), page.getByText('billet.pdf').click()])
    expect(popup).toBeDefined() // a new tab opened
    const link = page.getByRole('link', { name: /billet\.pdf/ })
    expect(await link.getAttribute('href')).toBe('/api/files/complet/billet.pdf')
    expect(await link.getAttribute('target')).toBe('_blank')
    expect((await fetch(new URL('/api/files/complet/billet.pdf', instance!.url))).status).toBe(200)
  })

  it('attachments: false in .folder.md makes the brick disappear while the pages stay', async () => {
    await boot(async (pages) => {
      await complet(pages)
      await put(join(pages, 'complet', '.folder.md'), '---\nattachments: false\n---\n')
    })
    const page = await open('complet', { noRequest: true })
    await page.getByText('Note du séjour').waitFor()
    expect(await heading(page).count()).toBe(0)
    expect(await page.getByText('billet.pdf').count()).toBe(0)
  })

  it('a folder holding only pages shows no brick', async () => {
    await boot(async (pages) => {
      await put(join(pages, 'donnees', 'note.md'), note('Seulement des données'))
    })
    const page = await open('donnees')
    await page.getByText('Seulement des données').waitFor()
    expect(await heading(page).count()).toBe(0)
  })

  it('a voyage.json at the root of the folder is a row', async () => {
    await boot(async (pages) => {
      await put(join(pages, 'racine', 'note.md'), note('Racine'))
      await put(join(pages, 'racine', 'voyage.json'), '{}')
    })
    const page = await open('racine')
    await heading(page).waitFor()
    expect((await heading(page).textContent()).replace(/\s+/g, ' ').trim()).toBe('Attachments 1')
    expect(await page.getByText('voyage.json').count()).toBe(1)
  })

  it('thirteen files show twelve rows and « Show all 13 », which reveals the thirteenth', async () => {
    await boot(async (pages) => {
      await put(join(pages, 'treize', 'note.md'), note('Treize'))
      for (let i = 1; i <= 13; i++) await put(join(pages, 'treize', `piece-${String(i).padStart(2, '0')}.pdf`), '%PDF-1.4\n')
    })
    const page = await open('treize')
    await heading(page).waitFor()
    expect(await page.getByText(/^piece-\d\d\.pdf$/).count()).toBe(12)
    expect(await page.getByText('piece-13.pdf').count()).toBe(0)
    await page.getByRole('button', { name: 'Show all 13' }).click()
    await page.getByText('piece-13.pdf').waitFor()
    expect(await page.getByText(/^piece-\d\d\.pdf$/).count()).toBe(13)
    expect(await page.getByRole('button', { name: /Show all/ }).count()).toBe(0)
  })

  it('a failing files route draws no brick and no error frame, the pages stay', async () => {
    await boot(complet)
    const page = await open('complet', { failFiles: true })
    await page.getByText('Note du séjour').waitFor()
    expect(await heading(page).count()).toBe(0)
    expect(await page.getByText('billet.pdf').count()).toBe(0)
  })
})
