/**
 * `adestia-pages-blocs-formulaires`, the cases the other ensemble files leave out (B-27, E-35; AD-33), driven in a
 * browser on `bench/launch.mjs --seed complement-formulaires`. Every expected line is written by hand from
 * docs/ecrans.md ("E-35 as built", "States of E-6, E-34 and E-35"); the reference files are in
 * `fixtures/complement-formulaires/`.
 *
 * PLAN (besoin · cas · attendu)
 *  B-27 nominal   table: Add column, fill header and cell, Apply → the pipe table has a third column
 *  B-27 bords     table: a typed `|` in a cell                    → written `\|`
 *  B-27 bords     Apply is one undo step                          → one Ctrl+Z takes the added row away
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { newBrowser, open, playwright } from './charte-browser.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const fixture = (name: string) => readFileSync(join(repo, 'packages/web/test/fixtures/complement-formulaires', name), 'utf8')

const children = new Set<ChildProcess>()
afterAll(() => {
  for (const c of children) c.kill('SIGTERM')
})
function boot(): Promise<{ url: string; data: string; stop(): Promise<void> }> {
  const data = mkdtempSync(join(tmpdir(), 'complement-formulaires-'))
  const child = spawn(execPath, [join(repo, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'complement-formulaires', '--locale', 'en', '--data', join(data, 'd')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
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
          data: join(data, 'd'),
          stop: () =>
            new Promise<void>((done) => {
              rmSync(data, { recursive: true, force: true })
              if (child.exitCode !== null) return done()
              child.once('exit', () => done())
              child.kill('SIGTERM')
            }),
        })
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
}

describe.skipIf(!playwright)('formulaires de blocs, cas complémentaires (adestia-pages-blocs-formulaires)', () => {
  let inst: Awaited<ReturnType<typeof boot>>
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    inst = await boot()
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await inst?.stop()
  })

  const path = (id: string) => join(inst.data, 'workspace/pages', `${id}.md`)
  const file = (id: string) => readFileSync(path(id), 'utf8')
  /** Spaces around pipes and runs of spaces do not matter to a markdown table. */
  const squash = (text: string) => text.split('\n').map((l) => l.replace(/-{3,}/g, '---').replace(/\s+/g, ' ').trim()).join('\n')

  async function visit(id: string) {
    const { context, page } = (await open(browser, inst.url, { theme: 'light', size: 'desk', locale: 'en', route: `/page/${id}` })) as { context: any; page: any }
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
    await page.locator('.ProseMirror[contenteditable="true"]').first().waitFor({ timeout: 20_000 })
    return { context, page }
  }
  async function openForm(page: any, hoverText: string, title: RegExp) {
    await page.getByText(hoverText).first().hover()
    await page.getByRole('button', { name: 'Block settings' }).first().click()
    await page.getByRole('button', { name: 'Edit data', exact: true }).click()
    const form = page.getByRole('dialog', { name: title })
    await form.waitFor({ timeout: 15_000 })
    return form
  }

  // Breaks if Add column no longer adds a column to the written table, or if a typed `|` is written unescaped.
  it('tableau_ajouter_une_colonne_ecrit_un_tableau_a_trois_colonnes_et_echappe_la_barre', async () => {
    const { context, page } = await visit('tb-colonne')
    const form = await openForm(page, 'Retard', /— data$/)
    await form.getByRole('button', { name: 'Add column', exact: true }).click()
    // the form now has three cells on the header row and on the body row
    const inputs = form.locator('input')
    await expect.poll(() => inputs.count()).toBe(6)
    await inputs.nth(2).fill('Note')
    await inputs.nth(5).fill('a|b')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 15_000 })
    await expect.poll(() => file('tb-colonne'), { timeout: 15_000 }).not.toBe(fixture('tableau-avant.md'))
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ state: 'detached', timeout: 15_000 })
    expect(squash(file('tb-colonne'))).toBe(
      ['---', 'title: Risques', '---', '', ':::table', '| Risque | Gravité | Note |', '| --- | --- | --- |', '| Retard | Haute | a\\|b |', ':::', ''].join('\n'),
    )
    await context.close()
  }, 90_000)

  // Breaks if Apply splits into several document changes: one Ctrl+Z would no longer take the new row away.
  it('appliquer_est_un_seul_pas_d_annulation', async () => {
    const { context, page } = await visit('f-annuler')
    const form = await openForm(page, 'Avancement', /— data$/)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    const last = form.getByRole('listitem').last()
    await last.locator('input').nth(0).fill('Budget')
    await last.locator('input').nth(1).fill('12')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 15_000 })
    await page.getByText('Budget').first().waitFor({ timeout: 10_000 })
    await page.getByText('La suite est à écrire.').click()
    await page.keyboard.press('Control+z')
    await page.getByText('Budget').first().waitFor({ state: 'detached', timeout: 10_000 })
    expect(await page.getByText('Avancement').count(), 'the original rows are still there').toBeGreaterThan(0)
    await context.close()
  }, 90_000)
})
