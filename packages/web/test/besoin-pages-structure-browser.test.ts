/**
 * `adestia-pages-structure` seen from its need (B-28 sections and columns, B-31 pages written before
 * the epic come back unchanged; P-19; E-4 reading and editing, E-34), through a driven browser on the
 * bench instance (`bench/launch.mjs`, scripted engine, seed `besoin-pages-structure`). Every expected
 * word, count and byte is written by hand from docs/parcours.md (B-28, B-31, P-19), docs/ecrans.md
 * (« E-4 move and E-34, states », « Drop refused », « Containers ») and docs/donnees.md (the grammar),
 * never from the components.
 *
 * PLAN (need -> case -> proof)
 *  B-28 nominal   a page with two sections, a band of 2, a band of 3 and a band inside a section is drawn:
 *                 columns side by side, a section folded when the file says `closed="fold"`
 *  B-28 nominal   the reader folds and unfolds a section; the file is not written; a reload gives back the saved state
 *  B-28 nominal   the gallery offers Section and Columns (Layout group); each lands in the page file
 *  B-28 nominal   Alt+ArrowRight takes a block into the next band's first column, Alt+ArrowLeft brings it out after the band
 *  B-28 nominal   the bar buttons "Move into the next container" / "Move out of the container" do the same
 *  B-28 nominal   a drag of the grip into an empty column puts the block there
 *  B-28 nominal   on the phone Move down at the end of a column crosses to the next column, Move up comes back
 *  B-28 nominal   moving a container moves its content
 *  B-28 bords     columns stack under 820 px (819 stacked, 821 side by side, the phone stacked)
 *  B-28 bords     a band goes into a section (the depth rule allows it); Alt+ArrowLeft at the page level, Alt+ArrowRight
 *                 with nothing after, say so and write nothing
 *  B-28 echec     a section into a column, a section into a section, columns into a column: refused with the reason
 *                 (keyboard: live region; pointer: visible beside the drop line), nothing written
 *  B-28 echec     a page written with a section in a section, or one column only, keeps its text on screen
 *  B-28 exclusion going back to 2 columns while the third holds a block is refused, nothing lost
 *  B-28 echec     (the fold on a read-only page is a hole: see the report, no test)
 *  B-31 nominal   a page without container reads without section nor band; opened and closed in the editor it is
 *                 not rewritten; after moving one block it differs from its source by that move only, byte for byte
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 * `STRUCTURE_SHOTS=<dir>` writes one capture per state.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, newBrowser, open, playwright } from './charte-browser.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const SHOTS = process.env.STRUCTURE_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function visit(browser: BrowserOf, base: string, locale: string, size: 'desk' | 'phone', path: string) {
  const { context, page } = (await open(browser, base, {
    theme: 'light',
    size,
    locale,
    route: `/page/${path}`,
    before: async (p: any) => {
      p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  return { context, page }
}

/** Presses Edit and waits for the editor with the given number of blocks (containers included). */
async function edit(page: any, blocks: number) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  await page.waitForFunction((n: number) => document.querySelectorAll('.ProseMirror [data-block]').length >= n, blocks, { timeout: 20_000 })
  await page.waitForTimeout(500) // the editor remounts once the index is read; a click lands on the final one
}

const blockN = (page: any, n: number) => page.locator('[data-block="callout"]', { hasText: `Bloc ${n}` }).first()
const control = (b: any, name: string) => b.getByRole('button', { name, exact: true }).first()
/** The bar of a block answers a hover (a touch screen has none: `touchBar`). */
async function bar(page: any, n: number) {
  const b = blockN(page, n)
  await b.scrollIntoViewIfNeeded()
  await b.hover()
  return b
}
async function touchBar(page: any, n: number) {
  const b = blockN(page, n)
  await b.scrollIntoViewIfNeeded()
  for (let attempt = 0; attempt < 6; attempt++) {
    const shownNow = await control(b, 'Move up').evaluate((e: HTMLElement) => getComputedStyle(e.parentElement!).pointerEvents !== 'none')
    if (shownNow) return b
    await b.getByText(`Texte de Bloc ${n}.`).tap()
    await page.waitForTimeout(500)
  }
  return b
}

async function stored(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}/api/pages/${path}.md`)
  return ((await res.json()) as { markdown: string }).markdown
}

/**
 * The shape of a stored page body, read from the fences: `callout(Bloc 1)`, `section(Résumé)[...]`,
 * `columns[col[...] col[...]]`. A container's fence must be longer than every fence inside it
 * (the grammar of docs/donnees.md): a page that breaks that rule yields `BAD-FENCE`.
 */
function outline(markdown: string): string {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '')
  type Node = { label: string; fence: number; kids: string[]; leaf: boolean }
  const root: Node = { label: '', fence: 99, kids: [], leaf: false }
  const stack: Node[] = [root]
  let bad = false
  for (const line of body.split('\n')) {
    const open = /^(:{3,})([a-z-]+)(?:\{(.*)\})?\s*$/.exec(line)
    const close = /^(:{3,})\s*$/.exec(line)
    const top = stack[stack.length - 1] as Node
    if (open && !top.leaf) {
      const name = open[2] as string
      const title = /title="([^"]*)"/.exec(open[3] ?? '')?.[1]
      const container = ['section', 'columns', 'col'].includes(name)
      const node: Node = { label: container ? name + (name === 'section' && title ? `(${title})` : '') : `${name}(${title ?? ''})`, fence: (open[1] as string).length, kids: [], leaf: !container }
      if (top.fence <= node.fence && top !== root) bad = true
      stack.push(node)
    } else if (close && stack.length > 1) {
      const node = stack.pop() as Node
      if (node.fence !== (close[1] as string).length) bad = true
      const text = node.leaf ? node.label : node.kids.length || node.label === 'col' ? `${node.label}[${node.kids.join(' ')}]` : `${node.label}[]`
      ;(stack[stack.length - 1] as Node).kids.push(text)
    }
  }
  return (bad ? 'BAD-FENCE ' : '') + root.kids.join(' ')
}
async function waitOutline(base: string, path: string, want: string) {
  await expect.poll(async () => outline(await stored(base, path)), { timeout: 30_000, message: `the structure the server holds for ${path}` }).toBe(want)
}

/**
 * A key pressed on a block's bar, as a user would: focus the control, check it has the focus, press, and press
 * again if the editor (which remounts after a save) swallowed the first press. Returns once the stored page shows `want`.
 */
async function pressOn(page: any, base: string, path: string, n: number, control_: string, key: string, want: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const b = await bar(page, n)
    await control(b, control_).focus()
    if ((await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')) !== control_) continue
    await page.keyboard.press(key)
    const done = await expect.poll(async () => outline(await stored(base, path)), { timeout: 4_000 }).toBe(want).then(() => true, () => false)
    if (done) return
  }
  await waitOutline(base, path, want)
}

const live = async (page: any, text: string) => page.getByText(text, { exact: false }).first().waitFor({ state: 'attached', timeout: 10_000 })
const box = async (page: any, text: string) => {
  const b = await page.getByText(text, { exact: true }).first().boundingBox()
  expect(b, text).not.toBeNull()
  return b as { x: number; y: number; width: number; height: number }
}

// ── the pages, written by hand in the grammar of docs/donnees.md (a container's fence is longer than its children's)
const page = (title: string, body: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\n${body.trim()}\n`
const callout = (title: string) => `:::callout{ico="💡" title="${title}"}\nTexte de ${title}.\n:::`
const band = (a = '', b = '') => `:::::columns\n::::col\n${a}\n::::\n\n::::col\n${b}\n::::\n:::::`
const deep = (n: string) => `::::section{title="Section ${n}"}\nTexte ${n}.\n::::`

const OLD_BODY =
  '# Titre du corps\n\nUn paragraphe avec **gras**, *italique* et un [lien](https://exemple.org).\n\n- un\n- deux\n  - sous-point\n- trois\n\n' +
  `1. premier\n2. second\n\n${callout('Bloc 1')}\n\n${callout('Bloc 2')}\n\n:::row\n:::\n\n` +
  '| a | b |\n| - | - |\n| 1 | 2 |\n\n:::content{type="perimetre" w="2/3"}\nTexte du bloc.\n:::\n\n:::figures\n- Avancement: 62 % — 8 lots\n- Jalon: 12 sept.\n:::'
const oldPage = (name: string, body: string) => page(`Ancienne ${name}`, body, 'status: ouverte\ncat: bois\n')

/** A file per page of the instance; a page a test writes to has its own. */
function pages(): Record<string, string> {
  const files: Record<string, string> = {}
  files['lecture'] = page(
    'Page structurée',
    `::::section{title="Résumé"}\nTout va bien en avril.\n::::\n\n` +
      `::::section{title="Archive" closed="fold"}\nContenu archivé.\n::::\n\n` +
      `${band(callout('Décisions'), callout('Risques'))}\n\n` +
      `:::::columns\n::::col\nUn.\n::::\n\n::::col\nDeux.\n::::\n\n::::col\nTrois.\n::::\n:::::\n\n` +
      `::::::section{title="Bilan"}\n:::::columns\n::::col\nPlus.\n::::\n\n::::col\nMoins.\n::::\n:::::\n::::::`,
  )
  // a block the vocabulary does not know: read-only
  files['lecture-seule'] = page('Page en lecture seule', `::::section{title="Repliable" closed="fold"}\nContenu replié.\n::::\n\n:::zorglub\nQuelque chose.\n:::`)
  const withBand = `${callout('Bloc 1')}\n\n${callout('Bloc 2')}\n\n${band()}`
  for (const name of ['clavier', 'bouton', 'glisser']) files[name] = page(`Colonnes ${name}`, withBand)
  files['clavier-sortie'] = page('Colonnes clavier-sortie', `${band(callout('Bloc 1'))}\n\n${callout('Bloc 2')}`)
  files['telephone-bord'] = page('Colonnes telephone-bord', band(`${callout('Bloc 1')}\n\n${callout('Bloc 2')}`, callout('Bloc 3')))
  for (const name of ['galerie-section', 'galerie-colonnes', 'galerie-les-deux']) files[name] = page(`Galerie ${name}`, callout('Bloc 1'))
  files['conteneur'] = page('Conteneur déplacé', `::::section{title="Section A"}\n${callout('Bloc 1')}\n::::\n\n${callout('Bloc 2')}`)
  files['colonnes-trois'] = page('Trois colonnes', `:::::columns\n::::col\n${callout('Bloc 1')}\n::::\n\n::::col\n::::\n\n::::col\n${callout('Bloc 3')}\n::::\n:::::`)
  files['telephone-barres'] = page('Colonnes telephone-barres', band(callout('Bloc 1'), callout('Bloc 2')))
  files['bande-reglage'] = page('Bande réglage', band(callout('Bloc 1')))
  files['profondeur-clavier'] = page('Profondeur clavier', `${deep('A')}\n\n${band()}`)
  files['profondeur-sections'] = page('Profondeur sections', `${deep('A')}\n\n${deep('B')}`)
  files['profondeur-bandes'] = page('Profondeur bandes', `${band(callout('Bloc 1'), callout('Bloc 2'))}\n\n${band(callout('Bloc 3'), callout('Bloc 4'))}`)
  files['profondeur-glisser'] = page('Profondeur glisser', `${deep('A')}\n\n${band()}`)
  files['bande-vers-section'] = page('Bande vers section', `${band(callout('Bloc 1'), callout('Bloc 2'))}\n\n${deep('A')}`)
  // malformed by hand: the text must still be shown
  files['mal-formee-section'] = page('Section dans section', `::::::section{title="Dehors"}\n::::section{title="Dedans"}\nTexte intérieur.\n::::\n::::::`)
  files['mal-formee-colonne'] = page('Une seule colonne', `:::::columns\n::::col\nSeule colonne.\n::::\n:::::`)
  for (const name of ['ancienne-ecrit', 'ancienne-ouverte']) files[name] = oldPage(name, OLD_BODY)
  return files
}

/** The bench launcher on the `empty` seed, over a data directory that already holds these pages. */
async function start(locale: string): Promise<Instance & { dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'structure-'))
  mkdirSync(join(dir, 'workspace', 'pages'), { recursive: true })
  for (const [name, text] of Object.entries(pages())) writeFileSync(join(dir, 'workspace', 'pages', `${name}.md`), text)
  const child = spawn(execPath, [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', '--seed', 'empty', '--locale', locale, '--data', dir], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (c: Buffer) => (stderr += c))
  const url = await new Promise<string>((resolve, reject) => {
    let out = ''
    child.stdout?.on('data', (c: Buffer) => {
      out += c
      const found = /listening on (\S+)/.exec(out)
      if (found) resolve(found[1] as string)
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
  return {
    url,
    dir,
    stop: () =>
      new Promise<void>((done) => {
        const clean = () => {
          rmSync(dir, { recursive: true, force: true })
          done()
        }
        if (child.exitCode !== null) return clean()
        child.once('exit', clean)
        child.kill('SIGTERM')
      }),
  }
}

describe.skipIf(!playwright)('pages structure, from the need', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await start('en')
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  // ── reading ──────────────────────────────────────────────────────────────
  // B-28 / E-4 reading. Breaks if a container is not drawn, a band is drawn one under the other on a desk,
  // or `closed="fold"` stops folding.
  it('lecture_dessine_sections_et_bandes_et_replie_celle_que_le_fichier_replie', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'lecture')
    await page.getByText('Tout va bien en avril.', { exact: true }).waitFor({ timeout: 15_000 })
    const resume = page.getByRole('button', { name: 'Résumé', exact: true })
    const archive = page.getByRole('button', { name: 'Archive', exact: true })
    expect(await resume.getAttribute('aria-expanded')).toBe('true')
    expect(await archive.getAttribute('aria-expanded')).toBe('false')
    expect(await page.getByText('Contenu archivé.', { exact: true }).isVisible()).toBe(false)
    // band of two
    const d = await box(page, 'Texte de Décisions.')
    const r = await box(page, 'Texte de Risques.')
    expect(Math.abs(d.y - r.y), 'two columns on one line').toBeLessThan(4)
    expect(r.x).toBeGreaterThan(d.x + 100)
    // band of three
    const [un, deux, trois] = [await box(page, 'Un.'), await box(page, 'Deux.'), await box(page, 'Trois.')]
    expect(Math.abs(un.y - deux.y)).toBeLessThan(4)
    expect(Math.abs(deux.y - trois.y)).toBeLessThan(4)
    expect(un.x).toBeLessThan(deux.x)
    expect(deux.x).toBeLessThan(trois.x)
    // a band inside a section
    const [plus, moins] = [await box(page, 'Plus.'), await box(page, 'Moins.')]
    expect(Math.abs(plus.y - moins.y)).toBeLessThan(4)
    expect(moins.x).toBeGreaterThan(plus.x)
    await shot(page, 'lecture-desk')
    await context.close()
  }, 60_000)

  // P-19 step 3: a reader's toggle, local to the screen. Breaks if the click does not fold, writes the page,
  // or the saved `closed` setting stops being the initial state after a reload.
  it('replier_une_section_est_local_a_l_ecran_et_n_ecrit_rien', async () => {
    const before = await stored(instance.url, 'lecture')
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'lecture')
    const resume = page.getByRole('button', { name: 'Résumé', exact: true })
    const archive = page.getByRole('button', { name: 'Archive', exact: true })
    await resume.waitFor({ timeout: 15_000 })
    await resume.click()
    await page.waitForFunction(() => !document.body.innerText.includes('Tout va bien en avril.'), null, { timeout: 5_000 })
    expect(await resume.getAttribute('aria-expanded')).toBe('false')
    await archive.click()
    await page.getByText('Contenu archivé.', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
    expect(await archive.getAttribute('aria-expanded')).toBe('true')
    await shot(page, 'replie-apres-clic')
    await resume.click()
    await page.getByText('Tout va bien en avril.', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
    await page.waitForTimeout(1_500) // a write, if one were going to happen, has happened by now
    expect(await stored(instance.url, 'lecture'), 'the fold is never written').toBe(before)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Archive', exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.getByRole('button', { name: 'Archive', exact: true }).getAttribute('aria-expanded')).toBe('false')
    expect(await page.getByRole('button', { name: 'Résumé', exact: true }).getAttribute('aria-expanded')).toBe('true')
    await context.close()
  }, 60_000)

  // B-28 « stacking under 820 px ». Breaks if the breakpoint moves, or the stacking is lost on the phone.
  it('colonnes_empilees_sous_820_px_cote_a_cote_au_dessus_et_sur_telephone', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'lecture')
    await page.getByText('Texte de Décisions.', { exact: true }).waitFor({ timeout: 15_000 })
    const pair = async () => ({ d: await box(page, 'Texte de Décisions.'), r: await box(page, 'Texte de Risques.') })
    for (const [width, stacked] of [[819, true], [821, false]] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(400)
      const { d, r } = await pair()
      if (stacked) {
        expect(r.y, `${width}px: the second column is under the first`).toBeGreaterThan(d.y + 10)
        expect(Math.abs(r.x - d.x), `${width}px: same left edge`).toBeLessThan(4)
      } else {
        expect(Math.abs(r.y - d.y), `${width}px: one line`).toBeLessThan(4)
      }
    }
    await context.close()
    const phone = await visit(browser, instance.url, 'en', 'phone', 'lecture')
    await phone.page.getByText('Texte de Décisions.', { exact: true }).waitFor({ timeout: 15_000 })
    const [un, deux, trois] = [await box(phone.page, 'Un.'), await box(phone.page, 'Deux.'), await box(phone.page, 'Trois.')]
    expect(deux.y).toBeGreaterThan(un.y + 10)
    expect(trois.y).toBeGreaterThan(deux.y + 10)
    expect(Math.abs(un.x - trois.x)).toBeLessThan(4)
    await shot(phone.page, 'lecture-phone')
    await phone.context.close()
  }, 60_000)

  // échec: the file breaks the depth rule or the count of columns. docs/donnees.md: "The validator keeps their text":
  // the page opens read-only (E-4) with its source and one diagnostic, and nothing the author wrote is lost.
  it('page_mal_formee_ouvre_en_lecture_seule_avec_son_texte_et_un_diagnostic', async () => {
    for (const [path, text] of [['mal-formee-section', 'Texte intérieur.'], ['mal-formee-colonne', 'Seule colonne.']] as const) {
      const before = await stored(instance.url, path)
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', path)
      await page.locator('.adestia-editor__raw').waitFor({ state: 'visible', timeout: 15_000 })
      expect(await page.locator('.adestia-editor__raw').innerText(), path).toContain(text)
      expect(await page.locator('.adestia-diagnostics__item').count(), `${path}: one diagnostic`).toBe(1)
      expect(await page.getByRole('button', { name: 'Edit', exact: true }).count(), `${path}: no Edit`).toBe(0)
      await shot(page, `mal-formee-${path}`)
      expect(await stored(instance.url, path)).toBe(before)
      await context.close()
    }
  }, 60_000)

  // ── B-31 ─────────────────────────────────────────────────────────────────
  // B-31: "opens, reads and saves unchanged". Breaks if a page without container is read with scaffolding.
  it('ancienne_page_se_lit_sans_section_ni_colonnes', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'ancienne-ouverte')
    await page.getByText('Texte du bloc.', { exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.locator('.adestia-reader').count()).toBe(1)
    expect(await page.locator('.adestia-block-section, .adestia-columns, .adestia-col').count()).toBe(0)
    await shot(page, 'ancienne-lecture')
    await context.close()
  }, 60_000)

  // B-31: the page is, byte for byte, what it was. Breaks if opening the editor and pressing Done rewrites it.
  it('ancienne_page_ouverte_puis_fermee_dans_l_editeur_n_est_pas_reecrite', async () => {
    const source = oldPage('ancienne-ouverte', OLD_BODY)
    expect(await stored(instance.url, 'ancienne-ouverte'), 'the seed is the hand-written source').toBe(source)
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'ancienne-ouverte')
    await edit(page, 5)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
    await page.waitForTimeout(1_000)
    expect(await stored(instance.url, 'ancienne-ouverte')).toBe(source)
    await context.close()
  }, 60_000)

  // B-31 + B-23: one move rewrites the page, and ONLY that move shows. Breaks if the writer re-spells
  // anything else (a list marker, a table row, a directive attribute, the final newline).
  it('ancienne_page_apres_un_deplacement_ne_differe_que_par_ce_deplacement_a_l_octet', async () => {
    const swapped = OLD_BODY.replace(
      ':::callout{ico="💡" title="Bloc 1"}\nTexte de Bloc 1.\n:::\n\n:::callout{ico="💡" title="Bloc 2"}\nTexte de Bloc 2.\n:::',
      ':::callout{ico="💡" title="Bloc 2"}\nTexte de Bloc 2.\n:::\n\n:::callout{ico="💡" title="Bloc 1"}\nTexte de Bloc 1.\n:::',
    )
    expect(swapped).not.toBe(OLD_BODY)
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'ancienne-ecrit')
    await edit(page, 5)
    await control(await bar(page, 2), 'Move up').click()
    await expect.poll(() => stored(instance.url, 'ancienne-ecrit'), { timeout: 30_000 }).toBe(oldPage('ancienne-ecrit', swapped))
    await context.close()
  }, 90_000)

  // ── the gallery ──────────────────────────────────────────────────────────
  async function addFromGallery(page: any, name: string) {
    await page.getByRole('button', { name: 'Add block', exact: true }).click()
    const gallery = page.getByRole('dialog', { name: 'Add block' })
    await gallery.waitFor({ timeout: 10_000 })
    for (const card of ['Section', 'Columns', 'Line break', 'Image gallery']) expect(await gallery.getByRole('option', { name: card, exact: true }).count(), `card ${card}`).toBe(1)
    await gallery.getByRole('option', { name, exact: true }).click()
    await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 })
  }

  // P-19 step 1. Breaks if the gallery lacks Section, or what it inserts is not a section.
  it('galerie_propose_section_et_l_insere_apres_le_bloc_courant', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-section')
    await edit(page, 1)
    await addFromGallery(page, 'Section')
    await page.locator('[data-block="section"]').first().waitFor({ timeout: 10_000 })
    await shot(page, 'galerie-section')
    await waitOutline(instance.url, 'galerie-section', 'callout(Bloc 1) section[]')
    await context.close()
  }, 90_000)

  // P-19 step 1: Columns lands as a band of two or three columns. Breaks if it inserts a band with one column or none.
  it('galerie_insere_une_bande_de_deux_ou_trois_colonnes', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-colonnes')
    await edit(page, 1)
    await addFromGallery(page, 'Columns')
    await page.locator('[data-block="columns"]').first().waitFor({ timeout: 10_000 })
    await shot(page, 'galerie-colonnes')
    await expect
      .poll(async () => /^callout\(Bloc 1\) columns\[col\[\] col\[\]( col\[\])?\]$/.test(outline(await stored(instance.url, 'galerie-colonnes'))), { timeout: 30_000 })
      .toBe(true)
    await context.close()
  }, 90_000)

  // B-24 « at the end of the container when the focus is a container », used by B-28: the band added right
  // after a section goes inside it, and a band is allowed in a section. Breaks if the band is lost or lands outside.
  it('galerie_colonnes_apres_une_section_vont_dans_la_section', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-les-deux')
    await edit(page, 1)
    await addFromGallery(page, 'Section')
    await page.locator('[data-block="section"]').first().waitFor({ timeout: 10_000 })
    await page.waitForTimeout(2_000)
    await addFromGallery(page, 'Columns')
    await expect
      .poll(async () => /^callout\(Bloc 1\) section\[columns\[col\[\] col\[\]( col\[\])?\]\]$/.test(outline(await stored(instance.url, 'galerie-les-deux'))), { timeout: 30_000, message: 'structure kept' })
      .toBe(true)
    await context.close()
  }, 90_000)

  it('galerie_en_francais_nomme_saut_de_ligne_l_ancienne_colonnes', async () => {
    const fr = await start('fr')
    try {
      const { context, page } = await visit(browser, fr.url, 'fr', 'desk', 'galerie-section')
      await page.getByRole('button', { name: 'Modifier', exact: true }).click()
      await page.getByRole('button', { name: 'Ajouter un bloc', exact: true }).click()
      const gallery = page.getByRole('dialog', { name: 'Ajouter un bloc' })
      await gallery.waitFor({ timeout: 10_000 })
      for (const card of ['Section', 'Colonnes', 'Saut de ligne']) expect(await gallery.getByRole('option', { name: card, exact: true }).count(), `carte ${card}`).toBe(1)
      await context.close()
    } finally {
      await fr.stop()
    }
  }, 90_000)

  // ── keyboard and buttons ─────────────────────────────────────────────────
  // P-19 step 2, B-23 + B-28. Breaks if Alt+ArrowRight / Alt+ArrowLeft stop crossing a container's edge.
  it('clavier_entre_dans_la_colonne_puis_en_sort_apres_la_bande', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'clavier')
    await edit(page, 5)
    expect(outline(await stored(instance.url, 'clavier'))).toBe('callout(Bloc 1) callout(Bloc 2) columns[col[] col[]]')
    await pressOn(page, instance.url, 'clavier', 2, 'Move down', 'Alt+ArrowRight', 'callout(Bloc 1) columns[col[callout(Bloc 2)] col[]]')
    await shot(page, 'clavier-dans-colonne')
    await pressOn(page, instance.url, 'clavier', 2, 'Move down', 'Alt+ArrowLeft', 'callout(Bloc 1) columns[col[] col[]] callout(Bloc 2)')
    await context.close()
  }, 120_000)

  // bords: the page level cannot be left, and nothing after the last block can take it. E-4 "Drop refused".
  it('clavier_au_bord_dit_pourquoi_et_n_ecrit_rien', async () => {
    const before = await stored(instance.url, 'clavier-sortie')
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'clavier-sortie')
    await edit(page, 4)
    await control(await bar(page, 2), 'Move up').focus()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Move up')
    await page.keyboard.press('Alt+ArrowLeft')
    await live(page, 'Already at the page level')
    await page.keyboard.press('Alt+ArrowRight')
    await live(page, 'Nothing after it can take the block')
    await page.waitForTimeout(1_500)
    expect(await stored(instance.url, 'clavier-sortie')).toBe(before)
    await context.close()
  }, 90_000)

  // P-19 step 2: out of a column, to just after its band.
  it('clavier_sort_un_bloc_de_sa_colonne_juste_apres_la_bande', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'clavier-sortie')
    await edit(page, 4)
    expect(outline(await stored(instance.url, 'clavier-sortie'))).toBe('columns[col[callout(Bloc 1)] col[]] callout(Bloc 2)')
    await pressOn(page, instance.url, 'clavier-sortie', 1, 'Move down', 'Alt+ArrowLeft', 'columns[col[] col[]] callout(Bloc 1) callout(Bloc 2)')
    await context.close()
  }, 90_000)

  // E-4 « Containers »: the buttons, shown only where they apply. Breaks if "out" shows at the page level
  // or "into" shows when no container follows.
  it('boutons_entrer_et_sortir_du_conteneur_n_apparaissent_que_ou_ils_servent', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'bouton')
    await edit(page, 5)
    let b = await bar(page, 2)
    expect(await control(b, 'Move out of the container').isVisible(), 'out is hidden at the page level').toBe(false)
    expect(await control(b, 'Move into the next container').isVisible(), 'into shows before a container').toBe(true)
    await control(b, 'Move into the next container').click()
    await waitOutline(instance.url, 'bouton', 'callout(Bloc 1) columns[col[callout(Bloc 2)] col[]]')
    b = await bar(page, 2)
    expect(await control(b, 'Move out of the container').isVisible(), 'out shows inside a column').toBe(true)
    await shot(page, 'boutons-dans-colonne')
    await control(b, 'Move out of the container').click()
    await waitOutline(instance.url, 'bouton', 'callout(Bloc 1) columns[col[] col[]] callout(Bloc 2)')
    b = await bar(page, 2)
    expect(await control(b, 'Move into the next container').isVisible(), 'into is hidden when no container follows').toBe(false)
    await context.close()
  }, 120_000)

  // bords: a band goes into a section (allowed), a Move down at the edge of a column crosses on the phone.
  it('une_bande_entre_dans_une_section_car_la_profondeur_le_permet', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'bande-vers-section')
    await edit(page, 6)
    expect(outline(await stored(instance.url, 'bande-vers-section'))).toBe('columns[col[callout(Bloc 1)] col[callout(Bloc 2)]] section(Section A)[]')
    await page.locator('[data-block="columns"]').first().hover()
    await control(page.locator('[data-block="columns"]').first(), 'Move into the next container').click()
    await waitOutline(instance.url, 'bande-vers-section', 'section(Section A)[columns[col[callout(Bloc 1)] col[callout(Bloc 2)]]]')
    await context.close()
  }, 90_000)

  it('telephone_move_down_en_bas_de_colonne_passe_dans_la_colonne_voisine_et_move_up_revient', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'telephone-bord')
    await edit(page, 6)
    let b = await touchBar(page, 2)
    // the columns are stacked: the second column is under the first
    const [one, three] = [await box(page, 'Texte de Bloc 1.'), await box(page, 'Texte de Bloc 3.')]
    expect(three.y).toBeGreaterThan(one.y + 10)
    await control(b, 'Move down').tap()
    await waitOutline(instance.url, 'telephone-bord', 'columns[col[callout(Bloc 1)] col[callout(Bloc 2) callout(Bloc 3)]]')
    await shot(page, 'telephone-colonne-voisine')
    b = await touchBar(page, 2)
    await control(b, 'Move up').tap()
    await waitOutline(instance.url, 'telephone-bord', 'columns[col[callout(Bloc 1) callout(Bloc 2)] col[callout(Bloc 3)]]')
    await context.close()
  }, 120_000)

  // B-23 / E-4 phone: the band's bar and the selected block's bar must not sit one over the other. Breaks if the
  // container's bar (two rows of 44 px) covers the Up/Down of the block inside it, which is the touch path to move.
  it('telephone_barre_de_la_bande_ne_recouvre_pas_move_up_et_move_down_du_bloc_choisi', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'telephone-barres')
    await edit(page, 5)
    const b = await touchBar(page, 1)
    await b.getByText('Texte de Bloc 1.').tap()
    await page.waitForTimeout(500)
    await shot(page, 'telephone-barres')
    for (const name of ['Move up', 'Move down']) {
      const btn = control(b, name)
      await btn.scrollIntoViewIfNeeded()
      const box_ = await btn.boundingBox()
      expect(box_, name).not.toBeNull()
      const { x, y, width, height } = box_ as { x: number; y: number; width: number; height: number }
      expect(width, `${name} is a finger target`).toBeGreaterThanOrEqual(44)
      const hit = await page.evaluate(
        ([cx, cy, label]: [number, number, string]) => {
          const top = document.elementFromPoint(cx, cy)
          return top?.closest('button')?.getAttribute('aria-label') === label
        },
        [x + width / 2, y + height / 2, name] as [number, number, string],
      )
      expect(hit, `${name} of the selected block is covered by another bar`).toBe(true)
    }
    // one bar at a time: no other bar that can be seen or touched overlaps the selected block's bar
    const overlapping = await page.evaluate((el: HTMLElement) => {
      const mine = el.querySelector(':scope > .adestia-edblock__bar') as HTMLElement
      const r = mine.getBoundingClientRect()
      return [...document.querySelectorAll('.adestia-edblock__bar')]
        .filter((o) => o !== mine)
        .filter((o) => {
          const cs = getComputedStyle(o)
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') return false
          const q = o.getBoundingClientRect()
          return q.width > 0 && q.height > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top
        }).length
    }, await b.elementHandle())
    expect(overlapping, 'another bar, visible, sits over the selected block\'s bar').toBe(0)
    // and it works with a finger, crossing to the neighbour column
    await control(b, 'Move down').tap()
    await waitOutline(instance.url, 'telephone-barres', 'columns[col[] col[callout(Bloc 1) callout(Bloc 2)]]')
    await context.close()
  }, 120_000)

  // E-4 « Containers »: "Moving a container moves its content". Breaks if the section leaves its blocks behind.
  it('deplacer_une_section_emporte_son_contenu', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'conteneur')
    await edit(page, 3)
    const section = page.locator('[data-block="section"]').first()
    await section.hover()
    await control(section, 'Move down').click()
    await waitOutline(instance.url, 'conteneur', 'callout(Bloc 2) section(Section A)[callout(Bloc 1)]')
    await context.close()
  }, 90_000)

  // ── depth ────────────────────────────────────────────────────────────────
  // B-28 « shows why instead of refusing silently ». Breaks if the move is made, or made silently.
  for (const [path, label, blocks, kind, expectedOutline] of [
    ['profondeur-clavier', 'a section into a column', 4, 'section', 'section(Section A)[] columns[col[] col[]]'],
    ['profondeur-sections', 'a section into a section', 2, 'section', 'section(Section A)[] section(Section B)[]'],
    ['profondeur-bandes', 'columns into a column', 6, 'columns', 'columns[col[callout(Bloc 1)] col[callout(Bloc 2)]] columns[col[callout(Bloc 3)] col[callout(Bloc 4)]]'],
  ] as const) {
    it(`clavier_refuse_${path.replace('profondeur-', '')}_avec_la_raison_et_n_ecrit_rien`, async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', path)
      await edit(page, blocks)
      expect(outline(await stored(instance.url, path)), 'the seed').toBe(expectedOutline.replace('section(Section A)[]', 'section(Section A)[]'))
      const first = page.locator(`[data-block="${kind}"]`).first()
      await first.hover()
      await control(first, 'Move down').focus()
      await page.keyboard.press('Alt+ArrowRight')
      await live(page, 'Too deep: a section or columns cannot go inside a column, nor a section inside a section')
      await shot(page, `refus-clavier-${path}`)
      await page.waitForTimeout(1_500)
      expect(outline(await stored(instance.url, path)), label).toBe(expectedOutline)
      await context.close()
    }, 90_000)
  }

  // Same refusal at the pointer: the reason is on screen beside the drop line while the section is over a column.
  it('glisser_une_section_sur_une_colonne_montre_la_raison_et_ne_depose_rien', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'profondeur-glisser')
    await edit(page, 4)
    const section = page.locator('[data-block="section"]').first()
    await section.hover()
    const grip = control(section, 'Move block')
    const g = (await grip.boundingBox()) as { x: number; y: number; width: number; height: number }
    const target = page.locator('[data-block="col"]').first()
    const t = (await target.boundingBox()) as { x: number; y: number; width: number; height: number }
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 12 })
    await page.mouse.move(t.x + t.width / 2 + 2, t.y + t.height / 2 + 2, { steps: 3 })
    await page.getByText('Too deep', { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 })
    await shot(page, 'refus-glisser')
    await page.mouse.up()
    await page.waitForTimeout(1_500)
    expect(outline(await stored(instance.url, 'profondeur-glisser'))).toBe('section(Section A)[] columns[col[] col[]]')
    await context.close()
  }, 90_000)

  // ── pointer ──────────────────────────────────────────────────────────────
  // B-28 « with the pointer ». Breaks if a drag of the grip cannot land in a column.
  it('glisser_un_bloc_dans_une_colonne_vide_le_depose_dedans', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'glisser')
    await edit(page, 5)
    const b = await bar(page, 2)
    const g = (await control(b, 'Move block').boundingBox()) as { x: number; y: number; width: number; height: number }
    const lane = (await page.locator('[data-block="col"]').nth(1).boundingBox()) as { x: number; y: number; width: number; height: number }
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(lane.x + lane.width / 2, lane.y + lane.height / 2, { steps: 15 })
    await page.mouse.move(lane.x + lane.width / 2 + 1, lane.y + lane.height / 2 + 1, { steps: 3 })
    await shot(page, 'glisser-survol')
    await page.mouse.up()
    await waitOutline(instance.url, 'glisser', 'callout(Bloc 1) columns[col[] col[callout(Bloc 2)]]')
    await context.close()
  }, 90_000)

  // ── band settings ────────────────────────────────────────────────────────
  async function openBandSettings(page: any) {
    const band = page.locator('[data-block="columns"]').first()
    await band.hover()
    await control(band, 'Block settings').click()
    await page.locator('#adestia-columns-why, button[aria-pressed]').first().waitFor({ timeout: 10_000 })
    return band
  }

  // B-28 « two or three side by side ». Breaks if the choice of 3 adds no third column, or 2 does not take it away.
  it('une_bande_passe_de_deux_a_trois_colonnes_et_revient_a_deux_quand_la_troisieme_est_vide', async () => {
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'bande-reglage')
    await edit(page, 4)
    expect(outline(await stored(instance.url, 'bande-reglage'))).toBe('columns[col[callout(Bloc 1)] col[]]')
    await openBandSettings(page)
    await page.getByRole('button', { name: '3', exact: true }).click()
    await waitOutline(instance.url, 'bande-reglage', 'columns[col[callout(Bloc 1)] col[] col[]]')
    await shot(page, 'bande-trois-colonnes')
    expect(await page.locator('[data-block="col"]').count()).toBe(3)
    await page.getByRole('button', { name: '2', exact: true }).click()
    await waitOutline(instance.url, 'bande-reglage', 'columns[col[callout(Bloc 1)] col[]]')
    await context.close()
  }, 90_000)

  // E-4 reading and editing: "going back to 2 is refused while the third holds blocks". Breaks if the third
  // column, with its block, is dropped by the choice; or if the refusal is silent.
  it('revenir_a_deux_colonnes_est_refuse_et_dit_pourquoi_tant_que_la_troisieme_porte_un_bloc', async () => {
    const before = await stored(instance.url, 'colonnes-trois')
    expect(outline(before)).toBe('columns[col[callout(Bloc 1)] col[] col[callout(Bloc 3)]]')
    const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'colonnes-trois')
    await edit(page, 5)
    await openBandSettings(page)
    const two = page.getByRole('button', { name: '2', exact: true })
    expect(await two.isEnabled(), 'the choice of 2 is not offered').toBe(false)
    const why = page.locator('#adestia-columns-why')
    expect((await why.innerText()).trim().length, 'a reason is said').toBeGreaterThan(10)
    expect(await why.isVisible()).toBe(true)
    await shot(page, 'reglages-bande-refus')
    await page.waitForTimeout(1_500)
    expect(outline(await stored(instance.url, 'colonnes-trois')), 'the third column and its block are still there').toBe('columns[col[callout(Bloc 1)] col[] col[callout(Bloc 3)]]')
    expect(await page.getByText('Texte de Bloc 3.', { exact: true }).count()).toBeGreaterThan(0)
    await context.close()
  }, 90_000)
})
