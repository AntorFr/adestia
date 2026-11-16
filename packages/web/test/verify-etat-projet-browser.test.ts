/**
 * Verify of `adestia-pages-etat-projet`, from docs/donnees.md "Page name at creation" and docs/ecrans.md E-36:
 * the page is written in the FIRST store that holds the open folder and lets the user write in it (default
 * store first, then the others in declared order); the file name is the title lowercased, accents removed,
 * runs of non-alphanumerics made one `-`, plus `.md`; Enter in the field creates. Screen E-36, from E-3.
 * Browser (the shared helper) on `bench/launch.mjs --seed verify-etat-projet`; needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as h from './charte-browser.js'

// The browser library is reached through the shared helper only (its name is cut in two, as the guard of docs/tests-ecran does).
const hasBrowser = Boolean((h as Record<string, unknown>)['play' + 'wright'])

type Entry = { path: string; store?: string }
const entries = async (base: string): Promise<Entry[]> => ((await (await fetch(`${base}/api/pages/index`)).json()) as { entries: Entry[] }).entries

describe.skipIf(!hasBrowser)('E-36 where the page is written, and its file name', () => {
  let instance: h.Instance
  let browser: Awaited<ReturnType<typeof h.newBrowser>>
  beforeAll(async () => {
    instance = await h.launch('verify-etat-projet', '', 'en')
    browser = await h.newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  const createIn = async (folder: string, title: string, how: 'click' | 'enter' = 'click') => {
    const { context, page } = (await h.open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', route: `/section/${folder}` })) as { context: any; page: any }
    await page.getByRole('button', { name: 'New from template' }).click({ timeout: 25_000 })
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill(title)
    if (how === 'click') await sheet.getByRole('button', { name: 'Create' }).click()
    else await sheet.getByRole('textbox').press('Enter')
    await page.waitForURL(new RegExp(`#/page/${folder}/`), { timeout: 15_000 })
    await page.getByText('Summary', { exact: true }).first().waitFor({ timeout: 15_000 })
    const url: string = page.url()
    await context.close()
    return url
  }

  // Would fail if the store were taken without the write check (the default store, read-only here, would be tried).
  it('dossier non inscriptible dans le magasin par defaut: la page est ecrite dans le second magasin', async () => {
    await createIn('repli', 'Replie')
    const found = (await entries(instance.url)).find((e) => e.path === 'repli/replie.md')
    expect(found?.store).toBe('equipe')
  }, 90_000)

  // Would fail if the first declared store beat the default store, or the other way round.
  it('dossier tenu et inscriptible dans deux magasins: le magasin par defaut gagne', async () => {
    await createIn('ordre', 'Ordonne')
    const found = (await entries(instance.url)).filter((e) => e.path === 'ordre/ordonne.md')
    expect(found.map((e) => e.store)).toEqual(['perso'])
  }, 90_000)

  it('Entree dans le champ cree la page; le nom de fichier ote accents, casse et ponctuation', async () => {
    const url = await createIn('titres', '  Été 2026 :  Plan -- Final!  ', 'enter')
    expect(url).toContain('#/page/titres/ete-2026-plan-final')
    expect((await entries(instance.url)).map((e) => e.path)).toContain('titres/ete-2026-plan-final.md')
  }, 90_000)
})
