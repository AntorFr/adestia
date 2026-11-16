/**
 * Feature `adestia-pages-etat-projet` seen from its need only (B-29, B-30, P-20; E-3 button, E-31, E-36, AD-36),
 * through a driven browser on the bench instance (`--seed besoin-etat-projet`, the REAL `project-management`
 * plugin ships the template). Every expectation is written by hand from docs/parcours.md, docs/ecrans.md,
 * docs/donnees.md and the mock-ups, never read back from the code. Needs `npm run build`.
 * The browser library is reached through the shared helper only, and its name is cut in two below, as the
 * guard of docs/tests-ecran does for its own file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as h from './charte-browser.js'

const hasBrowser = Boolean((h as Record<string, unknown>)['play' + 'wright'])

const get = async (base: string, path: string): Promise<string | undefined> => {
  const r = await fetch(`${base}/api/pages/${path}`)
  return r.ok ? ((await r.json()) as { markdown: string }).markdown : undefined
}

describe.skipIf(!hasBrowser)('Project status page from a template (P-20)', () => {
  let main: h.Instance
  let without: h.Instance
  let browser: Awaited<ReturnType<typeof h.newBrowser>>
  beforeAll(async () => {
    main = await h.launch('besoin-etat-projet', '', 'en')
    without = await h.launch('besoin-etat-projet-sans-modele', '', 'en')
    browser = await h.newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await main?.stop()
    await without?.stop()
  })

  const visit = async (base: string, route: string, size: h.Size = 'desk', theme: h.Theme = 'light', locale = 'en') => {
    const { context, page } = (await h.open(browser, base, { theme, size, locale, route })) as { context: any; page: any }
    return { context, page }
  }
  const sectionButton = (page: any, name = 'New from template') => page.getByRole('button', { name })
  /** E-3 → E-36 → Create; resolves once E-4 shows the new page. */
  const create = async (page: any, folder: string, title: string, buttonName = 'New from template', createName = 'Create', waitFor = 'Use Edit data to add one') => {
    await sectionButton(page, buttonName).waitFor({ timeout: 25_000 })
    await sectionButton(page, buttonName).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill(title)
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes(`/api/pages/${folder}/`), { timeout: 15_000 })
    await sheet.getByRole('button', { name: createName }).click()
    await written
    await page.waitForURL(new RegExp(`#/page/${folder}/`), { timeout: 15_000 })
    await page.getByText('Summary', { exact: true }).first().waitFor({ timeout: 15_000 })
    await page.getByText(waitFor).first().waitFor({ timeout: 15_000 })
  }
  const bodyText = async (page: any): Promise<string> => ((await page.locator('body').innerText()) as string).replace(/[\u00a0\u202f]/g, ' ')
  const shot = async (page: any, name: string) => {
    if (h.SHOTS) await page.screenshot({ path: `${h.SHOTS}/${name}.png` })
  }

  // ── B-30 / E-3 / E-36 ────────────────────────────────────────────────────
  it('E-36 nominal: Project status, un titre, Create ouvre la page ecrite sans trace du modele', async () => {
    const { context, page } = await visit(main.url, '/section/p1')
    await sectionButton(page).waitFor({ timeout: 25_000 })
    await sectionButton(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    expect(await sheet.getByRole('radio').first().getAttribute('aria-checked')).toBe('true')
    expect(await sheet.innerText()).toContain('Project status')
    // Create is inert on an empty title and says why.
    expect(await sheet.innerText()).toContain('Give the page a title with at least one letter or digit.')
    await shot(page, 'etat-projet-feuille')
    await sheet.getByRole('textbox').fill('Point Hebdo')
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/p1/'))
    await sheet.getByRole('button', { name: 'Create' }).click()
    await written
    await page.waitForURL(/#\/page\/p1\/point-hebdo/, { timeout: 15_000 })
    await page.getByText('Summary', { exact: true }).first().waitFor({ timeout: 15_000 })
    const md = (await get(main.url, 'p1/point-hebdo.md')) as string
    expect(md).toContain('title: Point Hebdo')
    expect(md).not.toContain('template:')
    for (const piece of [':::section{title="Summary"}', ':::::columns', '::::col', ':::progress', ':::milestones', ':::risks', ':::timeline'])
      expect(md).toContain(piece)
    // E-4 opens the page: a summary section is on screen
    expect(await page.locator('body').innerText()).toContain('Summary')
    await context.close()
  }, 90_000)

  it('E-4 bande a deux colonnes: avancement puis jalons a gauche, risques a droite, frise dessous', async () => {
    const { context, page } = await visit(main.url, '/section/p2')
    await create(page, 'p2', 'Bande')
    const box = async (text: string) => (await page.getByText(text).first().boundingBox()) as { x: number; y: number }
    const progress = (await page.getByText(/^40\s%$/).first().boundingBox()) as { x: number; y: number }
    const milestones = await box('No milestone yet')
    const risks = await box('No risk recorded')
    const timeline = await box('Dossier en retard')
    expect(Math.abs(progress.x - milestones.x)).toBeLessThan(40)
    expect(milestones.y).toBeGreaterThan(progress.y)
    expect(risks.x).toBeGreaterThan(milestones.x + 200)
    expect(timeline.y).toBeGreaterThan(milestones.y)
    await context.close()
  }, 90_000)

  it('B-29 avancement derive des sous-pages: 40 %, 1 en retard, prochaine echeance par son nom', async () => {
    const { context, page } = await visit(main.url, '/section/p3')
    await create(page, 'p3', 'Avancement')
    const text = await bodyText(page)
    expect(text).toContain('40 %')
    expect(text).toMatch(/\bLate\b/)
    expect(text).toMatch(/\n1\s*\n\s*Late/)
    expect(text).toContain('Next due')
    expect(text).toContain('Développement')
    await shot(page, 'etat-projet-avancement')
    await context.close()
  }, 90_000)

  it('B-29 avancement: la figure se nomme Progress et dit « 2 of 5 sub-pages done »', async () => {
    const { context, page } = await visit(main.url, '/section/p4')
    await create(page, 'p4', 'Libelles')
    const text = await bodyText(page)
    expect(text).toContain('Progress')
    expect(text).toContain('2 of 5 sub-pages done')
    await context.close()
  }, 90_000)

  it('B-29 avancement: la prochaine echeance dit sa distance (Developpement dans 20 jours)', async () => {
    const { context, page } = await visit(main.url, '/section/p5')
    await create(page, 'p5', 'Distance')
    const text = await bodyText(page)
    expect(text).toMatch(/in 20 days/)
    await context.close()
  }, 90_000)

  it('B-29 bord: un dossier sans sous-page dit « No page below this page yet. » et la page se cree', async () => {
    const { context, page } = await visit(main.url, '/section/neuf')
    await create(page, 'neuf', 'Premier')
    expect(await bodyText(page)).toContain('No page below this page yet.')
    await context.close()
  }, 90_000)

  it('B-29 jalons et risques commencent vides avec une phrase qui nomme Edit data', async () => {
    const { context, page } = await visit(main.url, '/section/pris')
    await create(page, 'pris', 'Vides')
    const text = await bodyText(page)
    expect(text).toContain('No milestone yet. Use Edit data to add one.')
    expect(text).toContain('No risk recorded. Use Edit data to add one.')
    await context.close()
  }, 90_000)

  // ── E-36 : titre pris, titre vide, annulation ───────────────────────────
  it('E-36 echec: un titre deja pris (accents et casse compris) est refuse sous le champ, rien n’est ecrit', async () => {
    const { context, page } = await visit(main.url, '/section/pris')
    const before = await get(main.url, 'pris/developpement.md')
    await sectionButton(page).waitFor({ timeout: 25_000 })
    await sectionButton(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill('DÉVELOPPEMENT')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await sheet.getByText('A page named "developpement" already exists here. Choose another title.').waitFor({ timeout: 10_000 })
    expect(await page.getByRole('dialog').count()).toBe(1)
    expect(page.url()).not.toContain('#/page/')
    expect(await get(main.url, 'pris/developpement.md')).toBe(before)
    await shot(page, 'etat-projet-nom-pris')
    await context.close()
  }, 90_000)

  it('E-36 echec: un titre sans lettre ni chiffre garde Create inerte et ecrit rien', async () => {
    const { context, page } = await visit(main.url, '/section/pris')
    await sectionButton(page).waitFor({ timeout: 25_000 })
    await sectionButton(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill('!!! ???')
    await sheet.getByText('Give the page a title with at least one letter or digit.').waitFor({ timeout: 5_000 })
    await sheet.getByRole('button', { name: 'Create' }).click({ force: true, timeout: 5_000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    expect(page.url()).not.toContain('#/page/')
    expect(await page.getByRole('dialog').count()).toBe(1)
    await context.close()
  }, 90_000)

  it('E-36 Echap ferme la feuille sans rien ecrire et rend le focus au bouton', async () => {
    const { context, page } = await visit(main.url, '/section/pris')
    await sectionButton(page).waitFor({ timeout: 25_000 })
    await sectionButton(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill('Abandon')
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 })
    expect(await get(main.url, 'pris/abandon.md')).toBeUndefined()
    expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('New from template')
    await context.close()
  }, 90_000)

  // ── E-3 : le bouton n’est pas toujours la ────────────────────────────────
  it('E-3 sans modele livre le bouton n’est pas dessine', async () => {
    const { context, page } = await visit(without.url, '/section/projet')
    await page.waitForFunction(() => document.body.textContent?.includes('Cadrage'), undefined, { timeout: 25_000 })
    await page.waitForTimeout(1500)
    expect(await sectionButton(page).count()).toBe(0)
    await context.close()
  }, 90_000)

  it('E-3 dossier tenu seulement par un magasin en lecture: pas de bouton; dossier inscriptible: bouton', async () => {
    const ro = await visit(main.url, '/section/gele')
    await ro.page.getByText('Seule page').first().waitFor({ timeout: 25_000 })
    await ro.page.waitForTimeout(1500)
    expect(await sectionButton(ro.page).count()).toBe(0)
    await ro.context.close()
    const rw = await visit(main.url, '/section/projet')
    await sectionButton(rw.page).waitFor({ timeout: 25_000 })
    await rw.context.close()
  }, 90_000)

  // ── langues ──────────────────────────────────────────────────────────────
  it('fr: bouton, feuille, nom pris et page creee sont en francais', async () => {
    const fr = await h.launch('besoin-etat-projet', '', 'fr')
    try {
      const v = await visit(fr.url, '/section/p7', 'desk', 'light', 'fr')
      await create(v.page, 'p7', 'Point Un', 'Nouveau depuis un modèle', 'Créer', 'Utilisez Modifier les données')
      const text = await bodyText(v.page)
      expect(text).toMatch(/Aucun jalon pour l['’]instant\. Utilisez Modifier les données pour en ajouter un\./)
      expect(text).toContain('Aucun risque noté. Utilisez Modifier les données pour en ajouter un.')
      await v.context.close()
      const w = await visit(fr.url, '/section/pris', 'desk', 'light', 'fr')
      await w.page.getByRole('button', { name: 'Nouveau depuis un modèle' }).waitFor({ timeout: 25_000 })
      await w.page.getByRole('button', { name: 'Nouveau depuis un modèle' }).click()
      const sheet = w.page.getByRole('dialog')
      await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
      expect(await sheet.innerText()).toContain('État du projet')
      await sheet.getByRole('textbox').fill('Cadrage')
      await sheet.getByRole('button', { name: 'Créer' }).click()
      await sheet.getByText('Une page nommée "cadrage" existe déjà ici. Choisissez un autre titre.').waitFor({ timeout: 10_000 })
      await w.context.close()
    } finally {
      await fr.stop()
    }
  }, 150_000)

  // ── B-27 / B-29 : completer par les formulaires ─────────────────────────
  /** The created page opens read-write; if E-4 shows its Edit control instead of Done, press it. */
  const inEditing = async (page: any) => {
    if ((await page.getByRole('button', { name: 'Done' }).count()) === 0) await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
    await page.getByRole('button', { name: 'Done' }).waitFor({ timeout: 10_000 })
  }
  const openData = async (page: any, near: string) => {
    const block = page.locator('.adestia-edblock').filter({ hasText: near }).last()
    await block.hover()
    await block.getByRole('button', { name: 'Block settings' }).click()
    await page.getByRole('button', { name: 'Edit data' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.waitFor({ timeout: 10_000 })
    return sheet
  }
  const fill = async (page: any, folder: string, title: string) => {
    await create(page, folder, title)
    await inEditing(page)
    const milestones = await openData(page, 'No milestone yet')
    await milestones.getByRole('button', { name: 'Add' }).click()
    await milestones.locator('input[type=text]').first().fill('Recette finale')
    await milestones.locator('input[type=date]').first().fill('2031-03-04')
    const saved = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes(`/api/pages/${folder}/`))
    await milestones.getByRole('button', { name: 'Apply' }).click()
    await saved
    const risks = await openData(page, 'No risk recorded')
    await risks.getByRole('button', { name: 'Add' }).click()
    await risks.locator('input[type=text]').first().fill('Fournisseur unique')
    await risks.locator('select').first().selectOption({ label: 'High' })
    const saved2 = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes(`/api/pages/${folder}/`))
    await risks.getByRole('button', { name: 'Apply' }).click()
    await saved2
  }
  it('B-29 jalons et risques saisis par leur formulaire s’affichent dans la bande, les phrases vides disparaissent', async () => {
    const { context, page } = await visit(main.url, '/section/p6')
    await fill(page, 'p6', 'Complete')
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByText('Fournisseur unique').first().waitFor({ timeout: 10_000 })
    const text = await bodyText(page)
    expect(text).toContain('Recette finale')
    expect(text).toContain('Fournisseur unique')
    expect(text).toContain('High')
    expect(text).not.toContain('No milestone yet')
    expect(text).not.toContain('No risk recorded')
    await shot(page, 'etat-projet-complete')
    await context.close()
  }, 120_000)

  it('B-29 le fichier ecrit par les formulaires suit la grammaire: une ligne « - Libelle: date » par jalon, « - Libelle: Niveau » par risque', async () => {
    const { context, page } = await visit(main.url, '/section/pris')
    await fill(page, 'pris', 'Grammaire')
    const md = (await get(main.url, 'pris/grammaire.md')) as string
    const lines = md.split('\n')
    expect(lines).toContain('- Recette finale: 2031-03-04')
    expect(lines).toContain('- Fournisseur unique: High')
    expect(lines).not.toContain('-')
    await context.close()
  }, 120_000)

  // ── E-31 : variantes de la frise ─────────────────────────────────────────
  it('E-31 la frise change d’aspect en choisissant list, son formulaire s’ouvre, le fichier ne change que par la declaration de la variante', async () => {
    const { context, page } = await visit(main.url, '/section/p8')
    await create(page, 'p8', 'Frise')
    const before = (await get(main.url, 'p8/frise.md')) as string
    const shapeBefore = await page.locator('body').innerHTML()
    await inEditing(page)
    const block = page.locator('.adestia-edblock').filter({ hasText: 'Dossier en retard' }).last()
    await block.hover()
    await block.getByRole('button', { name: 'Block settings' }).click()
    const saved = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/p8/frise.md'))
    await page.getByRole('radio', { name: 'list' }).click()
    await saved
    const after = (await get(main.url, 'p8/frise.md')) as string
    const strip = (s: string) => s.split('\n').filter((l) => !l.startsWith(':::timeline')).join('\n')
    expect(strip(after)).toBe(strip(before))
    expect(after).toContain('view="list"')
    await page.getByRole('button', { name: 'Edit data' }).waitFor({ timeout: 5_000 }).catch(() => undefined)
    await page.getByRole('button', { name: 'Edit data' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.waitFor({ timeout: 10_000 })
    expect(await sheet.innerText()).toContain('data')
    await shot(page, 'etat-projet-frise-formulaire')
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    expect(await page.locator('body').innerHTML()).not.toBe(shapeBefore)
    await page.getByText('Dossier en retard').first().waitFor({ timeout: 5_000 })
    expect(await bodyText(page)).toMatch(/late/i)
    await context.close()
  }, 120_000)

  // ── B-30 : lisible au bureau et au telephone, clair et sombre ───────────
  for (const [size, theme, folder] of [['phone', 'light', 'p9'], ['phone', 'dark', 'p10'], ['desk', 'dark', 'p11']] as const) {
    it(`E-4 page creee lisible: ${size} ${theme}, sans debordement et risques sous les jalons sur telephone`, async () => {
      const { context, page } = await visit(main.url, `/section/${folder}`, size, theme)
      await create(page, folder, `Lisible ${size} ${theme}`)
      await page.getByText(/^40\s%$/).first().waitFor({ timeout: 15_000 })
      const overflow = await page.evaluate(() => {
        const els = [...document.querySelectorAll<HTMLElement>('.adestia-canvas__body, .adestia-canvas, main')]
        return Math.max(0, ...els.map((e) => e.scrollWidth - e.clientWidth))
      })
      expect(overflow).toBeLessThanOrEqual(1)
      const box = async (text: string) => (await page.getByText(text).first().boundingBox()) as { x: number; y: number; width: number }
      const milestones = await box('No milestone yet')
      const risks = await box('No risk recorded')
      if (size === 'phone') expect(risks.y).toBeGreaterThan(milestones.y)
      expect(milestones.x + milestones.width).toBeLessThanOrEqual(page.viewportSize().width + 1)
      // legibility: the big figure contrasts with its tile (WCAG ratio >= 4.5)
      const ratio: number = await page.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length === 0 && /^40\s%$/.test(e.textContent ?? ''))!
        const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
        }
        let bg: number[] = [255, 255, 255]
        for (let n: HTMLElement | null = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor)
          if (c.length >= 3 && (c.length === 3 || c[3]! > 0.95)) {
            bg = c
            break
          }
        }
        const fg = parse(getComputedStyle(el).color)
        const [a, b] = [lum(fg), lum(bg)]
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
      expect(ratio).toBeGreaterThanOrEqual(4.5)
      await shot(page, `etat-projet-${size}-${theme}`)
      await context.close()
    }, 120_000)
  }
})
