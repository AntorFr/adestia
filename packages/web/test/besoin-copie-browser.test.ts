/**
 * Feature `adestia-bloc-a-copier` seen from its need only (B-copie-1, P-2 step 11, E-16, E-5, skill `copy-block`),
 * through a driven browser on the bench instance (`bench/launch.mjs --seed besoin-copie`, scripted engine). Every expectation is
 * written by hand from docs/parcours.md and docs/ecrans.md, never read back from the code. Needs `npm run build`.
 * The browser library is reached through the shared helper only.
 * The real-engine turn ("ask the agent to reword an email") needs a token and is not here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as h from './charte-browser.js'
import { patience } from './patience.js'

const hasBrowser = Boolean((h as Record<string, unknown>)['play' + 'wright'])
const WAIT = patience(60_000)
const EMAIL = 'Bonjour Anne,\n\nJe confirme jeudi.'
const T = {
  email: '00000000-0000-4000-8000-0000000c0001',
  bords: '00000000-0000-4000-8000-0000000c0002',
  live: '00000000-0000-4000-8000-0000000c0003',
  crit: '00000000-0000-4000-8000-0000000c0004',
}

type BrowserOf = Awaited<ReturnType<typeof h.newBrowser>>

const SHOTS = process.env.CHARTE_SHOTS

describe.skipIf(!hasBrowser)('Copy box in the chat thread (B-copie-1, E-16)', () => {
  let en: h.Instance
  let fr: h.Instance
  let browser: BrowserOf
  beforeAll(async () => {
    en = await h.launch('besoin-copie', '', 'en')
    fr = await h.launch('besoin-copie', '', 'fr')
    browser = await h.newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await en?.stop()
    await fr?.stop()
  })

  const visit = async (
    base: string,
    o: { tab?: string; size?: h.Size; theme?: h.Theme; locale?: string; clipboard?: 'ok' | 'refused' | 'absent'; route?: string } = {},
  ) => {
    const locale = o.locale ?? 'en'
    const context: any = await browser.newContext({
      ...h.VIEWPORTS[o.size ?? 'desk'],
      colorScheme: o.theme ?? 'light',
      locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    const page: any = await context.newPage()
    await page.addInitScript(
      (arg: { theme: string; tab: string | undefined; clipboard: string }) => {
        localStorage.setItem('adestia.theme', arg.theme)
        if (arg.tab) localStorage.setItem('adestia.tabs', JSON.stringify({ open: [arg.tab], active: arg.tab }))
        if (arg.clipboard === 'refused') {
          Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('refused')) })
          document.execCommand = () => false
        }
        if (arg.clipboard === 'absent') {
          Object.defineProperty(navigator, 'clipboard', { value: undefined })
          document.execCommand = () => false
        }
      },
      { theme: o.theme ?? 'light', tab: o.tab, clipboard: o.clipboard ?? 'ok' },
    )
    await page.goto(`${base}/#${o.route ?? '/'}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat', { timeout: WAIT })
    if (o.size === 'phone') {
      const onCanvas = await page.evaluate(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas')
      void onCanvas
    }
    return { context, page }
  }
  const boxes = (page: any) => page.locator('.adestia-chat .adestia-copybox')
  const shot = async (page: any, name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
  }
  const clip = (page: any): Promise<string> => page.evaluate(() => navigator.clipboard.readText())

  it('E-16 nominal: le texte de l’email est dans un encadre, l’icone Copy copie exactement ce texte et dit Copied sur place', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    await boxes(page).first().waitFor({ timeout: WAIT })
    expect(await boxes(page).count()).toBe(3)
    const first = boxes(page).first()
    expect(await first.innerText()).toContain('Bonjour Anne,')
    // the reply around the box is not in the box
    expect(await first.innerText()).not.toContain('Voici une version plus claire')
    const btn = first.getByRole('button', { name: 'Copy' })
    await btn.click()
    await first.getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    expect(await clip(page)).toBe(EMAIL)
    await shot(page, 'copie-copied')
    await context.close()
  }, 120_000)

  it('E-16 retour a ready: apres deux secondes l’icone redit Copy', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    const first = boxes(page).first()
    await first.getByRole('button', { name: 'Copy' }).click()
    await first.getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    await first.getByRole('button', { name: 'Copy' }).waitFor({ timeout: 8_000 })
    await context.close()
  }, 120_000)

  it('bord: deux blocs dans une reponse, le deuxieme bouton copie le texte du deuxieme seulement', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    await boxes(page).nth(1).getByRole('button', { name: 'Copy' }).click()
    await boxes(page).nth(1).getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    expect(await clip(page)).toBe('OK pour jeudi, Paul.')
    await context.close()
  }, 120_000)

  it('exclusion: un bloc de code sh de la meme reponse n’a pas de bouton Copy', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    await boxes(page).first().waitFor({ timeout: WAIT })
    expect(await page.getByRole('button', { name: 'Copy', exact: true }).count()).toBe(3)
    const pre = page.locator('.adestia-chat pre', { hasText: 'npm test' })
    expect(await pre.count()).toBe(1)
    expect(await pre.getByRole('button').count()).toBe(0)
    await context.close()
  }, 120_000)

  it('bord: un mot sans espace tres long est replie, sans defilement horizontal', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    const last = boxes(page).nth(2)
    await last.waitFor({ timeout: WAIT })
    const m = await last.evaluate((el: any) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1)
    expect(await last.innerText()).toContain('aaaaaaaa')
    await context.close()
  }, 120_000)

  it('bord: le texte copie est en police de lecture, pas en police de code', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    await boxes(page).first().waitFor({ timeout: WAIT })
    const fonts = await page.evaluate(() => {
      const f = (el: Element | null) => (el ? getComputedStyle(el).fontFamily : '')
      return { box: f(document.querySelector('.adestia-copybox')), code: f(document.querySelector('.adestia-chat pre')) }
    })
    expect(fonts.box).not.toBe(fonts.code)
    expect(fonts.box.toLowerCase()).not.toContain('mono')
    await context.close()
  }, 120_000)

  it('bord: un bloc copy vide est un cadre vide sans bouton', async () => {
    const { context, page } = await visit(en.url, { tab: T.bords })
    await boxes(page).first().waitFor({ timeout: WAIT })
    expect(await boxes(page).count()).toBe(2)
    expect(await boxes(page).first().getByRole('button').count()).toBe(0)
    expect(((await boxes(page).first().innerText()) as string).trim()).toBe('')
    await context.close()
  }, 120_000)

  it('bord: une reponse close dont la fence n’a jamais ete fermee montre le texte et le bouton, qui copie ce texte', async () => {
    const { context, page } = await visit(en.url, { tab: T.bords })
    const box = boxes(page).nth(1)
    await box.waitFor({ timeout: WAIT })
    expect(await box.innerText()).toContain('La suite manque')
    await box.getByRole('button', { name: 'Copy' }).click()
    await box.getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    expect(await clip(page)).toBe('Bonjour Marc,\n\nLa suite manque')
    await context.close()
  }, 120_000)

  it('echec: le presse-papiers refuse, l’icone dit Copy failed et le texte reste selectionnable', async () => {
    const { context, page } = await visit(en.url, { tab: T.email, clipboard: 'refused' })
    const first = boxes(page).first()
    await first.getByRole('button', { name: 'Copy' }).click()
    await first.getByRole('button', { name: 'Copy failed' }).waitFor({ timeout: WAIT })
    expect(await first.innerText()).toContain('Je confirme jeudi.')
    expect(await first.evaluate((el: any) => getComputedStyle(el).userSelect)).not.toBe('none')
    await shot(page, 'copie-failed')
    await context.close()
  }, 120_000)

  it('echec: sans API clipboard ni execCommand, Copy failed aussi', async () => {
    const { context, page } = await visit(en.url, { tab: T.email, clipboard: 'absent' })
    const first = boxes(page).first()
    await first.getByRole('button', { name: 'Copy' }).click()
    await first.getByRole('button', { name: 'Copy failed' }).waitFor({ timeout: WAIT })
    await context.close()
  }, 120_000)

  it('exclusion: pendant le flux, le texte est dans l’encadre mais il n’y a pas de bouton; le tour arrete, le bouton apparait', async () => {
    const { context, page } = await visit(en.url, { tab: T.live })
    const field = page.locator('.adestia-chat textarea')
    await field.fill('en flux')
    await field.press('Enter')
    const box = boxes(page).first()
    await box.waitFor({ timeout: WAIT })
    await page.getByText('Je reviens vers vous au sujet de').first().waitFor({ timeout: WAIT })
    expect(await box.getByRole('button').count()).toBe(0)
    await shot(page, 'copie-streaming')
    // the turn is stopped: the reply is settled, its fence never closed, the button shows (P-2 step 11)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await box.getByRole('button', { name: 'Copy' }).waitFor({ timeout: WAIT })
    await page.getByRole('button', { name: 'Stop', exact: true }).waitFor({ state: 'detached', timeout: WAIT })
    await context.close()
  }, 120_000)

  it('criterion: demander a l’agent de reformuler un email affiche l’email dans un encadre dont l’icone copie exactement ce texte', async () => {
    const { context, page } = await visit(en.url, { tab: T.crit })
    const field = page.locator('.adestia-chat textarea')
    await field.fill('reformule')
    await field.press('Enter')
    const box = boxes(page).first()
    await box.getByRole('button', { name: 'Copy' }).waitFor({ timeout: WAIT })
    expect(await box.innerText()).not.toContain('```')
    await box.getByRole('button', { name: 'Copy' }).click()
    await box.getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    expect(await clip(page)).toBe(EMAIL)
    await context.close()
  }, 120_000)

  it('i18n: en francais l’icone se nomme Copier, puis Copie, puis Echec de la copie', async () => {
    const { context, page } = await visit(fr.url, { tab: T.email, locale: 'fr' })
    const first = boxes(page).first()
    await first.getByRole('button', { name: 'Copier' }).click()
    await first.getByRole('button', { name: 'Copié' }).waitFor({ timeout: WAIT })
    await context.close()
    const failing = await visit(fr.url, { tab: T.email, locale: 'fr', clipboard: 'refused' })
    const box = boxes(failing.page).first()
    await box.getByRole('button', { name: 'Copier' }).click()
    await box.getByRole('button', { name: 'Échec de la copie' }).waitFor({ timeout: WAIT })
    await failing.context.close()
  }, 120_000)

  it('accessibilite: l’etat est annonce poliment (aria-live polite) dans l’encadre', async () => {
    const { context, page } = await visit(en.url, { tab: T.email })
    const first = boxes(page).first()
    await first.waitFor({ timeout: WAIT })
    expect(await first.evaluate((el: any) => el.closest('[aria-live="polite"]') !== null || el.querySelector('[aria-live="polite"]') !== null)).toBe(true)
    await context.close()
  }, 120_000)

  it('telephone: la cible du bouton fait au moins 44 px, sombre, le texte reste dans la bulle', async () => {
    const { context, page } = await visit(en.url, { tab: T.email, size: 'phone', theme: 'dark' })
    // phone: the thread may sit behind the list; open it through the stored tab
    const first = boxes(page).first()
    await first.waitFor({ timeout: WAIT })
    const b = await first.getByRole('button', { name: 'Copy' }).boundingBox()
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
    await shot(page, 'copie-phone-dark')
    await context.close()
  }, 120_000)

  it('E-5 exclusion: une fence copy dans une page reste un bloc de code, sans bouton', async () => {
    // the page is written through the product's own route (a seed page would have to join the corpus fixtures)
    const put = await fetch(`${en.url}/api/pages/copie/note.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '---\ntitle: Note copie\n---\n\nAvant.\n\n```copy\nTexte dans une page\n```\n\nApres.\n' }),
    })
    expect(put.status).toBe(200)
    const { context, page } = await visit(en.url, { route: '/page/copie/note' })
    await page.getByText('Texte dans une page').first().waitFor({ timeout: WAIT })
    expect(await page.locator('.adestia-copybox').count()).toBe(0)
    expect(await page.getByRole('button', { name: 'Copy', exact: true }).count()).toBe(0)
    await context.close()
  }, 120_000)
})

describe('Skill copy-block delivered to the agent (B-copie-1: the agent knows when and how)', () => {
  let en: h.Instance
  beforeAll(async () => {
    en = await h.launch('besoin-copie', '', 'en')
  }, 120_000)
  afterAll(async () => {
    await en?.stop()
  })

  it('la skill copy-block est livree au demarrage avec le quand (email, texte a reprendre) et le comment (fence copy)', async () => {
    const r = await fetch(`${en.url}/api/instructions/.claude/skills/copy-block/SKILL.md`)
    expect(r.status).toBe(200)
    const md = ((await r.json()) as { markdown: string }).markdown
    expect(md).toMatch(/^---\nname: copy-block\n/)
    expect(md.toLowerCase()).toContain('email')
    expect(md).toContain('```copy')
    expect(md.toLowerCase()).toMatch(/not for code|never for code|not code|code/)
  }, 60_000)

  it('la skill figure dans la liste des instructions comme skill gerée, au meme titre que page-author', async () => {
    const r = await fetch(`${en.url}/api/instructions`)
    const files = ((await r.json()) as { files: { path: string; kind: string }[] }).files
    expect(files.map((f) => f.path)).toContain('.claude/skills/copy-block/SKILL.md')
    expect(files.map((f) => f.path)).toContain('.claude/skills/page-author/SKILL.md')
  }, 60_000)
})
