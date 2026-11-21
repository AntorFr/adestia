/**
 * Task `adestia-pages-etat-projet-blocs` (B-29, E-31, E-35, E-34), from its exit criterion and not from its code:
 * the three project blocks are inserted from the gallery under the group Project; milestones and risks open their
 * form, and the file the form writes is the file a Raw entry writes; progress opens its settings and no form;
 * every state is drawn without amber, in both themes, on desk and phone, a level or a state never by colour alone.
 * Browser on `bench/launch.mjs --seed etat-projet-blocs`; needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, type Size, type Theme, launch, newBrowser, open, playwright } from './charte-browser.js'

const markdown = async (base: string, path: string): Promise<string> =>
  ((await (await fetch(`${base}/api/pages/${path}`)).json()) as { markdown: string }).markdown
const lastBlock = (text: string, kind: string): string | undefined =>
  [...text.matchAll(new RegExp(`:::${kind}[^\\n]*\\n([\\s\\S]*?)\\n:::`, 'g'))].at(-1)?.[1]

describe.skipIf(!playwright)('blocs projet: progress, milestones, risks', () => {
  let instance: Instance
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    instance = await launch('etat-projet-blocs', '', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  const visit = async (path: string, size: Size = 'desk', theme: Theme = 'light') => {
    const { context, page } = (await open(browser, instance.url, { theme, size, locale: 'en', route: `/page/${path}` })) as { context: any; page: any }
    await page.locator('.adestia-state, .pm-empty, .adestia-figure, .adestia-meter').first().waitFor({ timeout: 20_000 })
    return { context, page }
  }
  const startInsert = async (page: any, name: string) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Add block' }).click()
    const gallery = page.getByRole('dialog', { name: 'Add block' })
    await gallery.getByRole('option', { name }).first().waitFor({ timeout: 15_000 })
    const project = await page.evaluate(() =>
      [...document.querySelectorAll('.adestia-blockgallery__group')]
        .filter((g) => g.querySelector('h3')?.textContent === 'Project')
        .flatMap((g) => [...g.querySelectorAll('.adestia-blockcard__name')].map((c) => c.textContent)),
    )
    expect((project as string[]).sort(), 'the group Project').toEqual(['Milestones', 'Progress', 'Risks', 'Sub-projects', 'Timeline'])
    await gallery.locator('.adestia-blockgallery__group').filter({ has: page.getByRole('heading', { name: 'Project' }) }).getByRole('option', { name, exact: true }).click()
  }
  const save = async (page: any) => {
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ state: 'detached', timeout: 15_000 })
  }

  it('milestones_formulaire_et_raw_ecrivent_le_meme_bloc', async () => {
    const wrote: string[] = []
    for (const [mode, path] of [['form', 'etat/vide/INDEX.md'], ['raw', 'etat/une/INDEX.md']] as const) {
      const { context, page } = await visit(path)
      await startInsert(page, 'Milestones')
      const form = page.locator('.adestia-blockform')
      await form.waitFor({ timeout: 15_000 })
      if (mode === 'form') {
        await form.getByLabel('Milestone', { exact: true }).fill('Recette')
        await form.getByLabel('Date', { exact: true }).fill('2026-12-01')
        await form.getByLabel('Done', { exact: true }).check()
      } else {
        await form.getByRole('button', { name: 'Raw', exact: true }).click()
        await form.getByRole('textbox').fill('- Recette: 2026-12-01 — done')
      }
      await form.getByRole('button', { name: 'Apply', exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 15_000 })
      await save(page)
      await expect.poll(async () => lastBlock(await markdown(instance.url, path), 'milestones'), { timeout: 15_000 }).toBe('- Recette: 2026-12-01 — done')
      wrote.push(lastBlock(await markdown(instance.url, path), 'milestones')!)
      await context.close()
    }
    expect(wrote[0]).toBe(wrote[1])
  }, 120_000)

  it('risks_formulaire_et_raw_ecrivent_le_meme_bloc', async () => {
    const wrote: string[] = []
    for (const [mode, path] of [['form', 'etat/plusieurs/INDEX.md'], ['raw', 'etat/illisible/INDEX.md']] as const) {
      const { context, page } = await visit(path)
      await startInsert(page, 'Risks')
      const form = page.locator('.adestia-blockform')
      await form.waitFor({ timeout: 15_000 })
      if (mode === 'form') {
        await form.getByLabel('Risk', { exact: true }).fill('Fuite')
        await form.getByLabel('Level', { exact: true }).selectOption('High')
        await form.getByLabel('Owner', { exact: true }).fill('Marc')
      } else {
        await form.getByRole('button', { name: 'Raw', exact: true }).click()
        await form.getByRole('textbox').fill('- Fuite: High — Marc')
      }
      await form.getByRole('button', { name: 'Apply', exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 15_000 })
      await save(page)
      await expect.poll(async () => lastBlock(await markdown(instance.url, path), 'risks'), { timeout: 15_000 }).toBe('- Fuite: High — Marc')
      wrote.push(lastBlock(await markdown(instance.url, path), 'risks')!)
      await context.close()
    }
    expect(wrote[0]).toBe(wrote[1])
  }, 120_000)

  it('progress_ouvre_ses_reglages_et_aucun_formulaire', async () => {
    const { context, page } = await visit('etat/vide/INDEX.md')
    await startInsert(page, 'Progress')
    await page.getByRole('dialog', { name: /Block settings/ }).waitFor({ timeout: 15_000 })
    expect(await page.locator('.adestia-blockform').count()).toBe(0)
    await context.close()
  }, 60_000)

  for (const size of ['desk', 'phone'] as const)
    for (const theme of ['light', 'dark'] as const)
      it(`etats_dessines_sans_ambre_ni_couleur_seule_${size}_${theme}`, async () => {
        const { context, page } = await visit('etat/plusieurs/INDEX.md', size, theme)
        const read = () =>
          page.evaluate(() => {
            const pills = [...document.querySelectorAll('.adestia-state')]
            return {
              pills: pills.map((p) => ({ text: (p.textContent ?? '').trim(), icon: p.querySelectorAll('svg').length, cls: p.className })),
              bars: [...document.querySelectorAll('[role=progressbar]')].map((b) => b.getAttribute('aria-valuenow')),
              overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
              amber: [...document.querySelectorAll('.adestia-state, .adestia-figure, .adestia-meter__fill')].some((n) => /amber|warning/.test(n.className)),
            }
          })
        // the blocks draw one after another: wait for the expected state (all seven words,
        // both bars) in the DOM, not for the first pill, before reading
        const wanted = ['Done', 'Late', 'Next', 'Planned', 'High', 'Medium', 'Low']
        await expect
          .poll(
            async () => {
              const now = await read()
              return wanted.every((w) => now.pills.some((p: { text: string }) => p.text === w)) && now.bars.length >= 2
            },
            { timeout: 30_000 },
          )
          .toBe(true)
        const seen = await read()
        const words = seen.pills.map((p: { text: string }) => p.text)
        for (const w of ['Done', 'Late', 'Next', 'Planned', 'High', 'Medium', 'Low']) expect(words, w).toContain(w)
        for (const p of seen.pills) expect(p.icon, `${p.text}: an icon beside the word`).toBe(1)
        // the Progress tile's meter and the page's own view=bar: both read 62
        expect(seen.bars).toEqual(['62', '62'])
        expect(seen.amber).toBe(false)
        expect(seen.overflow, 'no horizontal scroll of the page').toBe(false)
        await context.close()
      }, 60_000)

  it('ligne_illisible_nommee_sous_le_bloc_et_blocs_vides_nomment_edit_data', async () => {
    const bad = await visit('etat/illisible/INDEX.md')
    const text = await bad.page.locator('.adestia-reader').innerText()
    expect(text).toContain('Line not understood: Pas de deux-points')
    expect(text).toContain('Line not understood: Panne: Critique')
    expect(text).toContain('Recette')
    await bad.context.close()
    const empty = await visit('etat/vide/INDEX.md')
    const t2 = await empty.page.locator('.adestia-reader').innerText()
    expect(t2).toContain('No page below this page yet.')
    expect(t2).toContain('No milestone yet. Use Edit data to add one.')
    expect(t2).toContain('No risk recorded. Use Edit data to add one.')
    await empty.context.close()
  }, 60_000)
})
