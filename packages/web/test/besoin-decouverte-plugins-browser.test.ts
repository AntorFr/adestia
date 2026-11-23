/**
 * Feature `adestia-decouverte-plugins` seen from its need only (B-34, P-21 step 4, E-36 Folder field, E-37 plugin
 * buttons), through a driven browser on the bench instance (`--seed besoin-decouverte-plugins`: the REAL `journal`,
 * `todo` and `project-management` plugins, nothing else). Expectations are literals written by hand from the fiche
 * (critere de sortie), docs/parcours.md (P-21 step 4) and docs/ecrans.md, never read back from the components.
 * The effect at its door (what the loader refuses, what a disabled plugin offers) is in
 * packages/server/test/besoin-decouverte-plugins-ensemble.test.ts; here the nominal of each gesture and what the user sees.
 *
 * Plan (need -> case -> proof):
 *   B-34  Journal, Todo, Project management on: the + of the home lists New folder, Journal, Task list, Project status
 *         (fr: Nouveau dossier, Journal, Liste de tâches, État du projet), nothing else        -> `the + lists`
 *   B-34  all ten bundled plugins on: still exactly those four lines (the eight others add none)  -> `eight others`
 *   B-34  Journal off: the line Journal is gone, the three others stay                          -> `journal off`
 *   P-21  Task list from the home: E-36 with the Folder field, root first then the writable folders, title, Create writes the
 *         page in the chosen folder, which opens carrying the checklist block; typing a task in the page files a task
 *         in that folder                                                                         -> `task list`
 *   P-21  Journal from the home: a cover page of type journal in the chosen folder, no folder made   -> `journal`
 *   B-34  exclusion: from inside a folder E-36 has no Folder field and writes in that folder       -> `in a folder`
 *
 * Playwright and Chromium come from the environment. Needs `npm run build`. `DECOUVERTE_SHOTS=<dir>` writes captures.
 */
import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })

const SHOTS = process.env.DECOUVERTE_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)

async function boot(env: Record<string, string>, locale: 'en' | 'fr'): Promise<Instance> {
  const before = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]))
  Object.assign(process.env, env)
  try {
    return await launch('besoin-decouverte-plugins', 'skippy', locale)
  } finally {
    for (const [k, v] of Object.entries(before)) if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
const visit = (browser: BrowserOf, base: string, locale: 'en' | 'fr', route: string, size: Size = 'desk') =>
  open(browser, base, {
    theme: 'light',
    size,
    locale,
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: patience(20_000) }).catch(() => null)
    },
  }) as Promise<{ context: any; page: any }>
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
const PLUS = { en: 'New…', fr: 'Nouveau…' } as const
/** The home draws its + only once the pages index has answered. */
async function openList(page: any, locale: 'en' | 'fr') {
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  const plus = page.getByRole('button', { name: PLUS[locale], exact: true })
  await plus.waitFor({ timeout: T(15_000) })
  await plus.click()
}
/** The names of the lines of the open list: the buttons of the dialog, each cut to its first line. */
async function lines(page: any): Promise<string[]> {
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: T(10_000) })
  const rows: string[] = await dialog.getByRole('button').allInnerTexts()
  return rows.map((r) => r.split('\n')[0]!.trim()).filter((r) => r && r !== 'Cancel' && r !== 'Annuler' && r !== 'Close' && r !== 'Fermer')
}
const pageIndex = async (base: string): Promise<string[]> => {
  const body = (await (await fetch(`${base}/api/pages/index`)).json()) as { entries: { path: string }[] }
  const list = body.entries
  return list.map((p) => p.path)
}
const markdownOf = async (base: string, path: string): Promise<string> => ((await (await fetch(`${base}/api/pages/${path}`)).json()) as { markdown: string }).markdown

describe.skipIf(!playwright)('the + of the home lists what the enabled plugins create (B-34, E-37)', () => {
  let browser: BrowserOf
  const instances: Instance[] = []
  beforeAll(async () => {
    browser = await newBrowser()
  }, 120_000)
  afterAll(async () => {
    await browser?.close()
    for (const i of instances) await i.stop()
  })

  it('the + lists New folder, Journal, Task list and Project status, nothing else', async () => {
    // red if a plugin's creation does not reach the list, or if a line appears that no enabled plugin declared
    const inst = await boot({}, 'en')
    instances.push(inst)
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    expect((await lines(page)).sort()).toEqual(['Journal', 'New folder', 'Project status', 'Task list'])
    await shot(page, 'plus-liste-en')
    await context.close()
  })

  it('in French the same list reads Nouveau dossier, Journal, Liste de tâches, Project status', async () => {
    const inst = await boot({}, 'fr')
    instances.push(inst)
    const { context, page } = await visit(browser, inst.url, 'fr', '/')
    await openList(page, 'fr')
    expect((await lines(page)).sort()).toEqual(['Journal', 'Liste de tâches', 'Nouveau dossier', 'État du projet'])
    await shot(page, 'plus-liste-fr')
    await context.close()
  })

  it('on a phone the list is the same', async () => {
    const inst = await boot({}, 'fr')
    instances.push(inst)
    const { context, page } = await visit(browser, inst.url, 'fr', '/', 'phone')
    await openList(page, 'fr')
    expect((await lines(page)).sort()).toEqual(['Journal', 'Liste de tâches', 'Nouveau dossier', 'État du projet'])
    await shot(page, 'plus-liste-phone')
    await context.close()
  })

  it('with all ten bundled plugins enabled the eight others add no line (exclusion)', async () => {
    const inst = await boot({ BESOIN_TOUS: '1' }, 'en')
    instances.push(inst)
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    expect((await lines(page)).sort()).toEqual(['Journal', 'New folder', 'Project status', 'Task list'])
    await context.close()
  })

  it('with Journal disabled its line is gone and the three others stay', async () => {
    // red if a disabled plugin still offers its creation
    const inst = await boot({ BESOIN_SANS_JOURNAL: '1' }, 'en')
    instances.push(inst)
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    expect((await lines(page)).sort()).toEqual(['New folder', 'Project status', 'Task list'])
    await shot(page, 'plus-liste-sans-journal')
    await context.close()
  })
})

describe.skipIf(!playwright)('creating from a plugin line (P-21 step 4, E-36)', () => {
  let browser: BrowserOf
  let inst: Instance
  beforeAll(async () => {
    browser = await newBrowser()
    inst = await boot({}, 'en')
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await inst?.stop()
  })

  it('Task list from the home: E-36 with the Folder field, the page lands in the chosen folder, and its checklist adds a task there', async () => {
    // red if E-36 has no Folder field from the home, if the page is written elsewhere, or if the checklist cannot add a task
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    await page.getByRole('dialog').getByRole('button', { name: /^Task list/ }).click()
    const sheet = page.getByRole('dialog')
    const folder = sheet.getByRole('combobox')
    await folder.waitFor({ timeout: T(15_000) })
    const options: string[] = (await folder.locator('option').allInnerTexts()).map((o: string) => o.trim())
    expect(options[0]).toBe('Root')
    expect(options.slice(1)).toEqual(['maison', 'projets'])
    await folder.selectOption({ label: 'projets' })
    await sheet.getByRole('textbox').fill('Courses')
    await shot(page, 'e36-liste-de-taches')
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/projets/'), { timeout: T(20_000) })
    await sheet.getByRole('button', { name: 'Create', exact: true }).click()
    expect((await written).status()).toBe(200)
    await page.waitForURL(/#\/page\/projets\/courses/, { timeout: T(15_000) })
    expect(await markdownOf(inst.url, 'projets/courses.md')).toContain(':::checklist')
    const add = page.getByRole('textbox', { name: 'Add a task here…' })
    await add.waitFor({ timeout: T(20_000) })
    const task = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/projets/'), { timeout: T(20_000) })
    await add.fill('Acheter du pain')
    await add.press('Enter')
    expect((await task).status()).toBe(200)
    await page.getByText('Acheter du pain').first().waitFor({ timeout: T(20_000) })
    await shot(page, 'page-liste-de-taches-avec-tache')
    const paths = await pageIndex(inst.url)
    expect(paths).toContain('projets/acheter-du-pain.md')
    expect(paths).not.toContain('acheter-du-pain.md')
    await context.close()
  })

  it('Task list from the home with the root chosen (the first option) writes the page at the root', async () => {
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    await page.getByRole('dialog').getByRole('button', { name: /^Task list/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('combobox').waitFor({ timeout: T(15_000) })
    expect(await sheet.getByRole('combobox').inputValue()).toBe('')
    await sheet.getByRole('textbox').fill('Racine liste')
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/'), { timeout: T(20_000) })
    await sheet.getByRole('button', { name: 'Create', exact: true }).click()
    expect((await written).url()).toContain('/api/pages/racine-liste.md')
    await page.waitForURL(/#\/page\/racine-liste/, { timeout: T(15_000) })
    await context.close()
  })

  it('a title already used in the chosen folder is refused under the field and nothing is written (failure)', async () => {
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    await page.getByRole('dialog').getByRole('button', { name: /^Task list/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('combobox').waitFor({ timeout: T(15_000) })
    const seeded = await fetch(`${inst.url}/api/pages/projets/premier.md`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ markdown: '---\ntitle: Premier\n---\n\nUn.\n' }) })
    expect(seeded.status).toBe(200)
    await sheet.getByRole('combobox').selectOption({ label: 'projets' })
    await sheet.getByRole('textbox').fill('Premier')
    await sheet.getByRole('button', { name: 'Create', exact: true }).click()
    await page.getByText('A page named "premier" already exists in projets. Choose another title.').waitFor({ timeout: T(15_000) })
    expect(await pageIndex(inst.url)).not.toContain('projets/premier-1.md')
    await context.close()
  })

  it('Journal from the home: a cover page typed journal in the chosen folder, no folder made', async () => {
    const { context, page } = await visit(browser, inst.url, 'en', '/')
    await openList(page, 'en')
    await page.getByRole('dialog').getByRole('button', { name: /^Journal/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('combobox').waitFor({ timeout: T(15_000) })
    await sheet.getByRole('combobox').selectOption({ label: 'maison' })
    await sheet.getByRole('textbox').fill('Carnet')
    await shot(page, 'e36-journal')
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/maison/'), { timeout: T(20_000) })
    await sheet.getByRole('button', { name: 'Create', exact: true }).click()
    expect((await written).status()).toBe(200)
    await page.waitForURL(/#\/page\/maison\/carnet/, { timeout: T(15_000) })
    expect(await markdownOf(inst.url, 'maison/carnet.md')).toMatch(/type: journal/)
    expect((await pageIndex(inst.url)).filter((p) => p.startsWith('maison/carnet/'))).toEqual([])
    await context.close()
  })

  it('from inside a folder E-36 has no Folder field and writes in that folder (exclusion)', async () => {
    const { context, page } = await visit(browser, inst.url, 'en', '/section/projets')
    await openList(page, 'en')
    await page.getByRole('dialog').getByRole('button', { name: /^Task list/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('textbox').waitFor({ timeout: T(15_000) })
    expect(await sheet.getByRole('combobox').count()).toBe(0)
    await sheet.getByRole('textbox').fill('Dans le dossier')
    const written = page.waitForResponse((r: any) => r.request().method() === 'PUT' && r.url().includes('/api/pages/'), { timeout: T(20_000) })
    await sheet.getByRole('button', { name: 'Create', exact: true }).click()
    expect((await written).url()).toContain('/api/pages/projets/dans-le-dossier.md')
    await context.close()
  })
})
