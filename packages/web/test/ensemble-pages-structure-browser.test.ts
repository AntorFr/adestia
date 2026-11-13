/**
 * `adestia-pages-structure` from its need (B-28, B-31; P-19; E-4 sections and columns, E-34), through a driven
 * browser and the pages API of a bench instance. Expectations come from the feature sheet (its criterion as
 * amended: a corpus page is rewritten after the tranche exactly as `main` rewrote it before), docs/parcours.md
 * (P-19), docs/ecrans.md (E-4) and docs/donnees.md, never from the components.
 *
 * Plan (need -> case -> proof):
 *  B-28 nominal   Section then Columns from the gallery, the stored page holds both          section_et_colonnes_depuis_la_galerie
 *  B-28 nominal   Alt+ArrowRight takes a block into the first column of the band after it    alt_fleche_droite_*
 *  B-28 bords     Alt+ArrowLeft brings it back out, just after the band; the button does too  alt_fleche_gauche_*
 *  B-28 echec     a section dragged into a section: the reason is shown, nothing is written   depot_refuse_*
 *  B-28 exclusion Alt+ArrowRight with nothing able to take the block: said, nothing written   alt_fleche_droite_sans_conteneur_*
 *  B-28 nominal   reading: a folded section hides its blocks, a click opens it, a reload folds  section_repliee_*
 *  B-28 exclusion the fold writes nothing (bytes and revision of the file are the same)       section_repliee_*
 *  B-28 bords     columns side by side at 821 px and above, stacked at 819 px and below, on a phone  colonnes_*
 *  B-31 nominal   every page of the corpus, PUT then read from the disk: the pinned rewrite    corpus_*
 *  B-31 bords     the pages the vocabulary refuses are refused and nothing is written          corpus_*
 *  B-31 nominal   a corpus page opened in the editor and touched is saved as main saves it    corpus_ecrit_par_l_editeur_*
 *
 * Needs `npm run build` and Playwright; without Playwright the browser cases are skipped (say so in the report).
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SHOTS, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const corpusDir = join(repo, 'packages', 'content', 'test', 'fixtures', 'corpus')

// ── an instance whose data directory the test owns, so a page can be put on the disk as a colleague would ──
interface Owned {
  url: string
  pages: string
  stop(): Promise<void>
}
function launchOwned(seed: string): Promise<Owned> {
  const base = mkdtempSync(join(tmpdir(), 'structure-'))
  const child: ChildProcess = spawn(execPath, [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', '--seed', seed, '--skin', 'skippy', '--locale', 'en', '--data', base], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (c: Buffer) => (stderr += c))
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout?.on('data', (c: Buffer) => {
      out += c
      const found = /listening on (\S+)/.exec(out)
      if (found)
        resolve({
          url: found[1] as string,
          pages: join(base, 'workspace', 'pages'),
          stop: () =>
            new Promise<void>((done) => {
              const clean = () => {
                rmSync(base, { recursive: true, force: true })
                done()
              }
              if (child.exitCode !== null) return clean()
              child.once('exit', clean)
              child.kill('SIGTERM')
            }),
        })
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
}

const callout = (n: number) => `:::callout{ico="💡" title="Bloc ${n}"}\nTexte du bloc ${n}.\n:::`
const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`

/** Bloc 1, a band of two columns (Bloc 2 | Bloc 3), Bloc 4. */
const BAND = page('Bande', [callout(1), `:::::columns\n::::col\n${callout(2)}\n::::\n\n::::col\n${callout(3)}\n::::\n:::::`, callout(4)].join('\n\n'))
/** Two sections, the second to be dragged into the first. */
const SECTIONS = page(
  'Deux sections',
  [`::::section{title="Haut"}\n${callout(1)}\n::::`, `::::section{title="Bas"}\n${callout(2)}\n::::`].join('\n\n'),
)
/** A section folded by the file, a section open. */
const FOLDS = page(
  'Replis',
  [`::::section{title="Replié" closed="fold"}\n${callout(1)}\n::::`, `::::section{title="Ouvert"}\n${callout(2)}\n::::`].join('\n\n'),
)

/** What the server holds for a page. */
async function stored(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}/api/pages/${path}.md`)
  return ((await res.json()) as { markdown: string }).markdown
}
/**
 * Where each callout of a stored page sits, as `"<containers>: <title>"` (`page` at the top level), read by fence
 * length as docs/donnees.md says: a container's fence is longer than its children's.
 */
function places(markdown: string): string[] {
  const out: string[] = []
  const stack: string[] = []
  for (const line of markdown.split('\n')) {
    const open = /^:{3,}([a-z-]+)/.exec(line)
    if (open) {
      if (open[1] === 'callout') out.push(`${stack.filter((n) => ['section', 'columns', 'col'].includes(n)).join('>') || 'page'}: ${/title="([^"]*)"/.exec(line)?.[1]}`)
      stack.push(open[1] as string)
    } else if (/^:{3,}\s*$/.test(line)) stack.pop()
  }
  return out
}

async function visit(browser: BrowserOf, base: string, path: string, size: 'desk' | 'phone' = 'desk') {
  const { context, page } = (await open(browser, base, {
    theme: 'light',
    size,
    locale: 'en',
    route: `/page/${path}`,
    before: async (p: any) => {
      p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  return { context, page }
}
async function edit(page: any, blocks: number) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  await page.waitForFunction((n: number) => document.querySelectorAll('[data-block="callout"]').length >= n, blocks, { timeout: 20_000 })
  await page.waitForTimeout(500) // the editor remounts once the index is read; a click lands on the final one
}
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/structure-${name}.png` })
}
const blockOf = (page: any, n: number) => page.locator('[data-block="callout"]', { hasText: `Bloc ${n}` }).first()
async function bar(page: any, n: number) {
  const b = blockOf(page, n)
  await b.scrollIntoViewIfNeeded()
  await b.hover()
  return b
}
const control = (b: any, name: string) => b.getByRole('button', { name, exact: true }).first()

describe.skipIf(!playwright)('adestia-pages-structure, from the need', () => {
  let instance: Owned
  let browser: BrowserOf
  const write = (name: string, text: string) => writeFileSync(join(instance.pages, `${name}.md`), text)
  beforeAll(async () => {
    instance = await launchOwned('besoin-pages-deplacer')
    browser = await newBrowser()
  }, 90_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  // P-19 step 1. Breaks if the gallery stops inserting a Section or Columns, or inserts them nested wrongly.
  it('section_et_colonnes_depuis_la_galerie_sont_enregistrees', async () => {
    const path = 'galerie-enregistre'
    const { context, page } = await visit(browser, instance.url, path)
    await edit(page, 2)
    await blockOf(page, 1).getByText('Texte du bloc 1.').click()
    for (const name of ['Section', 'Columns']) {
      await page.getByRole('button', { name: 'Add block', exact: true }).click()
      const g = page.getByRole('dialog', { name: 'Add block' })
      await g.waitFor({ timeout: 10_000 })
      await g.getByRole('option', { name, exact: true }).click()
      await g.waitFor({ state: 'detached', timeout: 10_000 })
    }
    await expect.poll(async () => /^:{4,}columns/m.test(await stored(instance.url, path)), { timeout: 20_000 }).toBe(true)
    const md = await stored(instance.url, path)
    expect(md).toMatch(/^:{4,}section/m)
    expect(md).toMatch(/^:{4,}columns/m)
    expect(places(md).map((p) => p.split(': ')[1]).sort()).toEqual(['Bloc 1', 'Bloc 2'])
    expect((md.match(/^:{3,}col\b/gm) ?? []).length).toBe(2)
    await shot(page, 'galerie')
    await context.close()
  }, 120_000)

  // P-19 step 2, B-28 keyboard. Breaks if Alt+ArrowRight stops taking a block into the band that follows it.
  it('alt_fleche_droite_prend_le_bloc_dans_la_premiere_colonne_de_la_bande_qui_suit', async () => {
    write('st-clavier', BAND)
    const { context, page } = await visit(browser, instance.url, 'st-clavier')
    await edit(page, 4)
    const b = await bar(page, 1)
    await control(b, 'Move into the next container').focus()
    await page.keyboard.press('Alt+ArrowRight')
    await expect
      .poll(async () => places(await stored(instance.url, 'st-clavier')).sort(), { timeout: 20_000 })
      .toEqual(['columns>col: Bloc 1', 'columns>col: Bloc 2', 'columns>col: Bloc 3', 'page: Bloc 4'])
    // Bloc 1 went into the FIRST column: the second still holds Bloc 3 alone.
    const md = await stored(instance.url, 'st-clavier')
    const second = md.slice(md.lastIndexOf('title="Bloc 3"') - 400)
    expect(second.indexOf('Bloc 1')).toBe(-1)
    await shot(page, 'clavier-dans-colonne')
    await context.close()
  }, 120_000)

  // B-28 « out »: Alt+ArrowLeft takes it out to just after its container, and the bar button does the same.
  // Breaks if the way out is lost, or leaves the block in the band.
  it('alt_fleche_gauche_sort_le_bloc_juste_apres_son_conteneur_et_le_bouton_aussi', async () => {
    write('st-sortie', BAND)
    const { context, page } = await visit(browser, instance.url, 'st-sortie')
    await edit(page, 4)
    await control(await bar(page, 2), 'Move out of the container').focus()
    await page.keyboard.press('Alt+ArrowLeft')
    await expect
      .poll(async () => places(await stored(instance.url, 'st-sortie')), { timeout: 20_000 })
      .toEqual(['page: Bloc 1', 'columns>col: Bloc 3', 'page: Bloc 2', 'page: Bloc 4'])
    await control(await bar(page, 3), 'Move out of the container').click()
    await expect
      .poll(async () => places(await stored(instance.url, 'st-sortie')), { timeout: 20_000 })
      .toEqual(['page: Bloc 1', 'page: Bloc 3', 'page: Bloc 2', 'page: Bloc 4'])
    await context.close()
  }, 120_000)

  // E-4 « Containers »: a block at the page level has nothing to leave. Breaks if "Already at the page level" is not said.
  it('alt_fleche_gauche_au_niveau_de_la_page_dit_deja_au_niveau_de_la_page_et_n_ecrit_rien', async () => {
    write('st-niveau', BAND)
    const before = readFileSync(join(instance.pages, 'st-niveau.md'), 'utf8')
    const { context, page } = await visit(browser, instance.url, 'st-niveau')
    await edit(page, 4)
    await control(await bar(page, 4), 'Move up').focus()
    await page.keyboard.press('Alt+ArrowLeft')
    await page.getByText('Already at the page level', { exact: true }).waitFor({ timeout: 10_000 })
    await page.waitForTimeout(2000)
    expect(readFileSync(join(instance.pages, 'st-niveau.md'), 'utf8')).toBe(before)
    await context.close()
  }, 60_000)

  // E-4 « Drop refused » (pointer): a section dropped inside a section keeps the drop line, says why, writes nothing.
  // Breaks if the refusal is silent (no reason), or if the section lands inside the other one anyway.
  it('depot_refuse_d_une_section_dans_une_section_dit_pourquoi_et_n_ecrit_rien', async () => {
    write('st-profond', SECTIONS)
    const before = readFileSync(join(instance.pages, 'st-profond.md'), 'utf8')
    const { context, page } = await visit(browser, instance.url, 'st-profond')
    await edit(page, 2)
    const reason = 'Too deep: a section or columns cannot go inside a column, nor a section inside a section'
    const bas = page.locator('[data-block="section"]', { hasText: 'Bloc 2' }).first()
    await bas.hover()
    const grip = await bas.getByRole('button', { name: 'Move block', exact: true }).first().boundingBox()
    const target = await blockOf(page, 1).boundingBox()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(grip.x + (target.x + 40 - grip.x) * f, grip.y + (target.y + target.height / 2 - grip.y) * f, { steps: 5 })
    await page.getByText(reason, { exact: true }).first().waitFor({ timeout: 10_000 })
    await shot(page, 'depot-refuse')
    await page.mouse.up()
    await page.waitForTimeout(2500)
    expect(readFileSync(join(instance.pages, 'st-profond.md'), 'utf8')).toBe(before)
    expect(places(await stored(instance.url, 'st-profond'))).toEqual(['section: Bloc 1', 'section: Bloc 2'])
    await context.close()
  }, 120_000)

  // E-4 « Drop refused » (keyboard): a section cannot go into the section after it. Breaks if it is taken in, or refused silently.
  it('alt_fleche_droite_d_une_section_devant_une_section_est_refusee_en_le_disant', async () => {
    write('st-profond-clavier', SECTIONS)
    const before = readFileSync(join(instance.pages, 'st-profond-clavier.md'), 'utf8')
    const { context, page } = await visit(browser, instance.url, 'st-profond-clavier')
    await edit(page, 2)
    const haut = page.locator('[data-block="section"]', { hasText: 'Bloc 1' }).first()
    await haut.hover()
    await haut.getByRole('button', { name: 'Move block', exact: true }).first().focus()
    await page.keyboard.press('Alt+ArrowRight')
    await page
      .getByText(/^(Nothing after it can take the block|Too deep: a section or columns cannot go inside a column, nor a section inside a section)$/)
      .first()
      .waitFor({ timeout: 10_000 })
    await page.waitForTimeout(2000)
    expect(readFileSync(join(instance.pages, 'st-profond-clavier.md'), 'utf8')).toBe(before)
    await context.close()
  }, 60_000)

  // P-19 step 3. Breaks if the saved `closed` is ignored, the toggle is lost, or the fold is written.
  it('section_repliee_par_le_fichier_s_ouvre_et_se_replie_a_la_lecture_sans_rien_ecrire', async () => {
    write('st-replis', FOLDS)
    const file = join(instance.pages, 'st-replis.md')
    const bytes = readFileSync(file, 'utf8')
    const mtime = statSync(file).mtimeMs
    const { context, page } = await visit(browser, instance.url, 'st-replis')
    const folded = page.getByRole('button', { name: 'Replié', exact: true })
    await folded.waitFor({ timeout: 20_000 })
    expect(await folded.getAttribute('aria-expanded')).toBe('false')
    expect(await page.getByText('Texte du bloc 1.').isVisible(), 'the folded section hides its block').toBe(false)
    expect(await page.getByText('Texte du bloc 2.').isVisible(), 'the open section shows its block').toBe(true)
    await folded.click()
    await page.getByText('Texte du bloc 1.').waitFor({ state: 'visible', timeout: 10_000 })
    expect(await folded.getAttribute('aria-expanded')).toBe('true')
    await shot(page, 'replis-ouvert')
    await page.getByRole('button', { name: 'Ouvert', exact: true }).click()
    await page.getByText('Texte du bloc 2.').waitFor({ state: 'hidden', timeout: 10_000 })
    // local to the screen: a reload folds the first again, the second is open again
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Replié', exact: true }).waitFor({ timeout: 20_000 })
    expect(await page.getByText('Texte du bloc 1.').isVisible()).toBe(false)
    expect(await page.getByText('Texte du bloc 2.').isVisible()).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(bytes)
    expect(statSync(file).mtimeMs).toBe(mtime)
    await context.close()
  }, 90_000)

  // B-31 through the editor: a corpus page opened, one letter typed and saved comes out as `main` saved it (the source, or the
  // rewrite pinned beside the fixture when the source was not canonical, with that letter). Breaks if the editor's save path rewrites a plain page differently.
  for (const [fixture, anchor, last] of [
    ['hand--lists', 'etoile deux', 'etoile deux'],
    ['hand--prose', 'Citation', 'sur deux lignes'],
  ] as const) {
    it(`corpus_ecrit_par_l_editeur_${fixture.replace('hand--', '')}_est_ecrit_comme_main_l_ecrivait`, async () => {
      const source = readFileSync(join(corpusDir, `${fixture}.md`), 'utf8')
      const pin = join(corpusDir, `${fixture}.out`)
      const want = existsSync(pin) ? readFileSync(pin, 'utf8') : source
      const name = `st-${fixture.replace('hand--', '')}`
      write(name, source)
      const { context, page } = await visit(browser, instance.url, name)
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
      await page.waitForTimeout(1500)
      const target = page.locator('.ProseMirror').getByText(anchor).first()
      await target.click()
      await page.keyboard.press('End')
      await page.keyboard.type('x')
      await expect.poll(() => readFileSync(join(instance.pages, `${name}.md`), 'utf8'), { timeout: 20_000 }).toBe(want.replace(last, `${last}x`))
      await context.close()
    }, 90_000)
  }

  // B-28: columns stack under 820 px. Breaks if the breakpoint moves, or the columns never stack on a phone.
  for (const [label, width, stacked] of [
    ['821_px_cote_a_cote', 821, false],
    ['819_px_empilees', 819, true],
    ['telephone_390_px_empilees', 390, true],
  ] as const) {
    it(`colonnes_${label}`, async () => {
      write('st-bande-lecture', BAND)
      // 390 is the phone of the bench (touch, mobile); the two edges are plain windows of 819 and 821 px
      const context = await browser.newContext(
        width === 390
          ? { viewport: { width, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'en-US' }
          : { viewport: { width, height: 900 }, locale: 'en-US' },
      )
      const page: any = await context.newPage()
      await page.goto(`${instance.url}/#/page/st-bande-lecture`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.adestia-chat', { timeout: 30_000 })
      // a narrow shell shows the chat first: the user goes to the page with the apps button
      if ((await page.locator('.adestia-shell').getAttribute('data-screen')) === 'chat') await page.getByRole('button', { name: 'Open apps' }).first().click()
      await page.waitForSelector('.adestia-shell[data-screen="canvas"], .adestia-columns', { timeout: 30_000 })
      await page.getByText('Texte du bloc 3.').waitFor({ state: 'visible', timeout: 30_000 })
      const cols = await page.evaluate(() => [...document.querySelectorAll('.adestia-columns .adestia-col')].map((c) => {
        const r = c.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) }
      }))
      expect(cols.length).toBe(2)
      expect(cols[0]!.h, 'the columns are drawn, not hidden').toBeGreaterThan(20)
      expect(cols[1]!.h).toBeGreaterThan(20)
      if (stacked) {
        expect(cols[1]!.x, 'same left edge when stacked').toBe(cols[0]!.x)
        expect(cols[1]!.y, 'the second below the first').toBeGreaterThanOrEqual(cols[0]!.y + cols[0]!.h)
      } else {
        expect(cols[1]!.y, 'same top when side by side').toBe(cols[0]!.y)
        expect(cols[1]!.x, 'the second to the right').toBeGreaterThan(cols[0]!.x + 100)
      }
      await shot(page, `colonnes-${width}`)
      await context.close()
    }, 60_000)
  }
})

// ── B-31 and the criterion: the corpus, written back through the product's own write path ─────────────────────
// What `main` refused at the time the corpus was taken (probed on `main` with this seed): the vocabulary is closed,
// so a page with an unknown block, a missing attribute or a plugin that is not enabled is not written at all.
const REFUSED_BY_MAIN = [
  'hand--unknown-blocks.md',
  'seed--base--workspace__pages__blocs__tous-les-blocs.md',
  'seed--base--workspace__pages__blocs__vocabulaire-casse.md',
  'seed--besoin-pages-deplacer-sans-pm--workspace__pages__lecture-seule.md',
  'seed--besoin-pages-ensemble--workspace__pages__blocs-faux.md',
  'seed--besoin-pages-ensemble--workspace__pages__callout-vide.md',
  'seed--pages-proof--workspace__pages__proof__readonly.md',
  'seed--plugins-correctifs--workspace__pages__balades__val-sans-retour.md',
  'seed--plugins-correctifs--workspace__pages__balades__week-end.md',
  'seed--plugins-correctifs--workspace__pages__chantier-cuisine.md',
]

describe('adestia-pages-structure, the corpus through the pages API (B-31)', () => {
  let instance: Owned
  beforeAll(async () => {
    instance = await launchOwned('besoin-pages-deplacer')
  }, 90_000)
  afterAll(async () => {
    await instance?.stop()
  })
  const names = readdirSync(corpusDir).filter((f) => f.endsWith('.md')).sort()
  const put = (path: string, markdown: string) =>
    fetch(`${instance.url}/api/pages/${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ markdown }) })

  it('corpus_le_dossier_des_fixtures_est_celui_de_la_tranche', () => {
    expect(names.length).toBeGreaterThanOrEqual(175)
    expect(REFUSED_BY_MAIN.every((n) => names.includes(n))).toBe(true)
  })

  // The criterion: after the tranche, the page is written exactly as `main` wrote it before — the source when it was
  // canonical, else the rewrite pinned beside the fixture. Breaks if a page without a container changes by one byte.
  it('corpus_chaque_page_ecrite_par_l_api_redevient_celle_que_main_ecrivait', { timeout: 180_000 }, async () => {
    const wrong: string[] = []
    let written = 0
    for (const [i, name] of names.entries()) {
      if (REFUSED_BY_MAIN.includes(name)) continue
      const source = readFileSync(join(corpusDir, name), 'utf8')
      const pin = join(corpusDir, name.replace(/\.md$/, '.out'))
      const want = existsSync(pin) ? readFileSync(pin, 'utf8') : source
      const res = await put(`corpus-${i}.md`, source)
      if (res.status !== 200) {
        wrong.push(`${name}: HTTP ${res.status}`)
        continue
      }
      const onDisk = readFileSync(join(instance.pages, `corpus-${i}.md`), 'utf8')
      if (onDisk !== want) wrong.push(`${name}: wrote ${JSON.stringify(onDisk.slice(0, 80))}`)
      else written++
    }
    expect(wrong).toEqual([])
    expect(written).toBe(names.length - REFUSED_BY_MAIN.length)
  })

  // Breaks if a page `main` refused is now written, or one it accepted is now refused.
  it('corpus_les_pages_que_main_refusait_sont_refusees_et_rien_n_est_ecrit', { timeout: 60_000 }, async () => {
    for (const [i, name] of names.entries()) {
      if (!REFUSED_BY_MAIN.includes(name)) continue
      const res = await put(`corpus-refused-${i}.md`, readFileSync(join(corpusDir, name), 'utf8'))
      expect(res.status, name).toBe(422)
      expect(existsSync(join(instance.pages, `corpus-refused-${i}.md`)), name).toBe(false)
    }
  })
})
