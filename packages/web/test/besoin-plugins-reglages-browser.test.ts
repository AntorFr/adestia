/**
 * Feature `adestia-plugins-reglages` seen from its need only (B-plugins-1 to B-plugins-4, P-plugins-1, E-9 tile, E-37),
 * through a driven browser on the bench instance (`bench/launch.mjs --restart --seed besoin-plugins-reglages`: the plain
 * binary's boot loop, so `/api/restart` really restarts it; scripted engine, two turns running). Every expectation is
 * written by hand from docs/parcours.md and docs/ecrans.md, never read back from the code. Needs `npm run build`.
 * The effects themselves (the file, the 404, the 409) are proved at the server door in
 * packages/server/test/besoin-plugins-reglages.test.ts; here is the nominal of each gesture and what the screen shows.
 * Playwright comes from the environment through the shared helper only.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as h from './charte-browser.js'
import { patience } from './patience.js'

const hasBrowser = Boolean((h as Record<string, unknown>)['play' + 'wright'])
const WAIT = patience(60_000)
const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const SHOTS = process.env.CHARTE_SHOTS

const children = new Set<ChildProcess>()
afterAll(() => {
  for (const child of children) child.kill('SIGTERM')
})

function boot(seed: string, extra: string[] = []): Promise<{ url: string; stop(): Promise<void> }> {
  const child = spawn(execPath, [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', ...extra, '--seed', seed, '--locale', 'en'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk))
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk
      const found = /listening on (\S+)/.exec(out)
      if (found)
        resolve({
          url: found[1] as string,
          stop: () =>
            new Promise<void>((done) => {
              if (child.exitCode !== null) return done()
              child.once('exit', () => done())
              child.kill('SIGTERM')
            }),
        })
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
}

const plugins = (base: string) => fetch(`${base}/api/plugins`).then((r) => r.json()) as Promise<{ plugins: { id: string; wanted: boolean; loaded: boolean }[] }>

describe.skipIf(!hasBrowser)('Plugins settings page (B-plugins-1 to B-plugins-4, E-37, E-9 tile)', () => {
  let browser: Awaited<ReturnType<typeof h.newBrowser>>
  beforeAll(async () => {
    browser = await h.newBrowser()
  }, 120_000)
  afterAll(async () => {
    await browser?.close()
  })

  const open = async (base: string, route: string, o: { size?: h.Size; theme?: h.Theme } = {}) => {
    const context: any = await browser.newContext({ ...h.VIEWPORTS[o.size ?? 'desk'], colorScheme: o.theme ?? 'light', locale: 'en-US' })
    const page: any = await context.newPage()
    await page.addInitScript((theme: string) => localStorage.setItem('adestia.theme', theme), o.theme ?? 'light')
    await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' })
    return { page, context }
  }
  const shot = async (page: any, name: string) => {
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `plugins-reglages-${name}.png`) })
  }

  describe('P-plugins-1 on an instance that holds plugins found but not all active, with a real restart', () => {
    let inst: Awaited<ReturnType<typeof boot>>
    beforeAll(async () => {
      inst = await boot('besoin-plugins-reglages', ['--restart'])
    }, 240_000)
    afterAll(async () => {
      await inst?.stop()
    })

    it('E-9 the Plugins tile says how many plugins are active among those found', async () => {
      const { page, context } = await open(inst.url, '/settings')
      await page.waitForSelector('text=3 active of 6', { timeout: WAIT })
      await shot(page, 'e9-tuile')
      await context.close()
    }, 120_000)

    it('E-9 the tile text reads "N active of M found", as the screen map says', async () => {
      const { page, context } = await open(inst.url, '/settings')
      await page.waitForSelector('text=3 active of 6', { timeout: WAIT })
      expect(await page.getByText('3 active of 6 found').count()).toBeGreaterThan(0)
      await context.close()
    }, 120_000)

    it('E-37 B-plugins-1 lists every plugin found in three groups, with kind, description, origin, and the refusal with its reason', async () => {
      const { page, context } = await open(inst.url, '/settings/plugins')
      await page.waitForSelector('text=boussole', { timeout: WAIT })
      const body: string = await page.locator('body').innerText()
      const at = (word: string) => body.indexOf(word)
      // groups in the order Active, Found not active, Refused
      expect(at('Active')).toBeGreaterThan(-1)
      expect(at('Found, not active')).toBeGreaterThan(at('Active'))
      expect(at('Refused')).toBeGreaterThan(at('Found, not active'))
      const groupOf = (id: string) => {
        const position = body.indexOf(id + '\n')
        return position < body.indexOf('Found, not active') ? 'active' : position < body.lastIndexOf('Refused') ? 'inactive' : 'refused'
      }
      for (const id of ['atlas', 'loupe', 'socle']) expect(groupOf(id)).toBe('active')
      for (const id of ['boussole', 'veille', 'lointain']) expect(groupOf(id)).toBe('inactive')
      expect(body).toContain("Atlas, une app d'essai.")
      expect(body).toContain("Une veille, fonction d'essai.")
      expect(body).toContain("Une loupe, outil d'essai.")
      expect(body).toContain('found in the plugins folder')
      expect(body).toMatch(/found in source \S+/)
      expect(body).toMatch(/casse[\s\S]*but the folder is "casse"/)
      for (const kind of ['app', 'tool', 'feature', 'core']) expect(body).toMatch(new RegExp(`\\n${kind}\\n`))
      // no switch for the refused plugin; the core switch is on and inert
      expect(await page.getByRole('switch', { name: 'casse' }).count()).toBe(0)
      const core = page.getByRole('switch', { name: 'socle' })
      expect(await core.isChecked()).toBe(true)
      expect(await core.isDisabled()).toBe(true)
      expect(await page.getByRole('switch', { name: 'atlas' }).isChecked()).toBe(true)
      expect(await page.getByRole('switch', { name: 'boussole' }).isChecked()).toBe(false)
      expect(await page.getByRole('button', { name: 'Restart now' }).count()).toBe(0)
      await shot(page, 'e37-desk-light')
      await context.close()
    }, 120_000)

    it('E-37 reads on a phone in the dark: the rows are there and nothing overflows sideways', async () => {
      const { page, context } = await open(inst.url, '/settings/plugins', { size: 'phone', theme: 'dark' })
      await page.waitForSelector('text=boussole', { timeout: WAIT })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await shot(page, 'e37-phone-dark')
      await context.close()
    }, 120_000)

    it('the owner turns one app on and another off, restarts, and the app turned on appears while the other is gone, without opening the file', async () => {
      const { page, context } = await open(inst.url, '/settings/plugins')
      await page.waitForSelector('text=boussole', { timeout: WAIT })
      const flip = async (id: string) => {
        const [response] = await Promise.all([
          page.waitForResponse((r: any) => r.url().includes(`/api/plugins/${id}`) && r.request().method() === 'PUT', { timeout: WAIT }),
          page.getByRole('switch', { name: id }).click(),
        ])
        expect(response.status()).toBe(200)
      }
      await flip('boussole')
      await flip('atlas')
      // the server's own answer: the file wants them, the instance has not changed
      const after = Object.fromEntries((await plugins(inst.url)).plugins.map((p) => [p.id, p]))
      expect(after['boussole']).toMatchObject({ wanted: true, loaded: false })
      expect(after['atlas']).toMatchObject({ wanted: false, loaded: true })
      // the screen: each flipped row shows its pending mark; the restart bar shows
      await page.waitForSelector('text=Active after restart', { timeout: WAIT })
      await page.waitForSelector('text=Off after restart', { timeout: WAIT })
      expect(await page.getByRole('button', { name: 'Restart now' }).count()).toBe(1)
      await shot(page, 'e37-flipped')
      // turning one back removes its mark; the other stays pending, so the bar stays
      await flip('atlas')
      await page.waitForSelector('text=Off after restart', { state: 'detached', timeout: WAIT })
      expect(await page.getByText('Active after restart').count()).toBe(1)
      expect(await page.getByRole('button', { name: 'Restart now' }).count()).toBe(1)
      await flip('atlas')
      await page.waitForSelector('text=Off after restart', { timeout: WAIT })

      // the restart is refused while turns are running, and says how many
      await page.getByRole('button', { name: 'Restart now' }).click()
      await page.getByRole('button', { name: 'Restart anyway' }).waitFor({ timeout: WAIT })
      expect(await page.locator('body').innerText()).toMatch(/[1-9]\d* turn\(s\) running/)
      await shot(page, 'e37-refused-turns')
      // the signal is the server's answer to the forced restart, not the bar's "Coming back" label: that state lasts
      // one health poll (250 ms) and a loaded machine can miss it entirely
      const [restartAnswer] = await Promise.all([
        page.waitForResponse((r: any) => r.url().endsWith('/api/restart') && r.request().method() === 'POST', { timeout: WAIT }),
        page.getByRole('button', { name: 'Restart anyway' }).click(),
      ])
      expect(restartAnswer.status()).toBe(202)

      // the instance answers again, with the file's wish now the loaded state
      const deadline = Date.now() + WAIT
      let back = false
      while (!back && Date.now() < deadline) {
        back = await plugins(inst.url).then((p) => p.plugins.find((r) => r.id === 'boussole')?.loaded === true).catch(() => false)
        if (!back) await new Promise((r) => setTimeout(r, 300))
      }
      expect(back).toBe(true)
      const restarted = Object.fromEntries((await plugins(inst.url)).plugins.map((p) => [p.id, p]))
      expect(restarted['boussole']).toMatchObject({ wanted: true, loaded: true })
      expect(restarted['atlas']).toMatchObject({ wanted: false, loaded: false })
      await context.close()

      // E-37 afterwards: rows moved groups, no mark, no bar
      const fresh = await open(inst.url, '/settings/plugins')
      await fresh.page.waitForSelector('text=boussole', { timeout: WAIT })
      const body: string = await fresh.page.locator('body').innerText()
      expect(body.indexOf('boussole\n')).toBeLessThan(body.indexOf('Found, not active'))
      expect(body.indexOf('atlas\n')).toBeGreaterThan(body.indexOf('Found, not active'))
      expect(body).not.toContain('after restart')
      expect(await fresh.page.getByRole('button', { name: 'Restart now' }).count()).toBe(0)
      await shot(fresh.page, 'e37-after-restart')
      await fresh.context.close()

      // E-2: the tile and the route of the app turned on exist, those of the app turned off do not
      const home = await open(inst.url, '/')
      await home.page.waitForSelector('text=Boussole', { timeout: WAIT })
      expect(await home.page.getByText('Atlas', { exact: true }).count()).toBe(0)
      await home.page.goto(`${inst.url}/#/boussole`, { waitUntil: 'domcontentloaded' })
      await home.page.waitForSelector('h1:has-text("Boussole")', { timeout: WAIT })
      await home.page.goto(`${inst.url}/#/atlas`, { waitUntil: 'domcontentloaded' })
      await home.page.waitForSelector('.adestia-chat', { timeout: WAIT })
      expect(await home.page.locator('h1:has-text("Atlas")').count()).toBe(0)
      await shot(home.page, 'e2-after-restart')
      await home.context.close()
    }, 240_000)
  })

  describe('B-plugins-4 a file that cannot be written', () => {
    let inst: Awaited<ReturnType<typeof boot>>
    beforeAll(async () => {
      inst = await boot('besoin-plugins-reglages-lecture')
    }, 240_000)
    afterAll(async () => {
      await inst?.stop()
    })
    it('E-37 still lists everything and its switches are inert', async () => {
      const { page, context } = await open(inst.url, '/settings/plugins')
      await page.waitForSelector('text=boussole', { timeout: WAIT })
      for (const id of ['atlas', 'boussole', 'loupe', 'veille', 'lointain']) expect(await page.getByRole('switch', { name: id }).isDisabled()).toBe(true)
      expect(await page.locator('body').innerText()).toMatch(/read-only|cannot be written|can.t be written|not writable/i)
      await shot(page, 'e37-lecture-seule')
      await context.close()
    }, 120_000)
  })

  describe('B-plugins-4 an instance started without a configuration file', () => {
    // The server door (404 without a config file) is proved in packages/server/test/besoin-plugins-reglages.test.ts;
    // the launcher hides only /api/settings, so here the 404 of GET /api/plugins is answered in the browser.
    let inst: Awaited<ReturnType<typeof boot>>
    beforeAll(async () => {
      inst = await boot('besoin-plugins-reglages')
    }, 240_000)
    afterAll(async () => {
      await inst?.stop()
    })
    it('E-37 lists no row and says the instance does not expose its configuration; the E-9 tile stays drawn without a count', async () => {
      const context: any = await browser.newContext({ ...h.VIEWPORTS['desk'], locale: 'en-US' })
      const page: any = await context.newPage()
      await page.route('**/api/plugins', (route: any) =>
        route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"this instance does not expose its configuration"}' }),
      )
      await page.goto(`${inst.url}/#/settings`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=See what this instance found and turn it on or off', { timeout: WAIT })
      expect(await page.getByText(/\d+ active of/).count()).toBe(0)
      await page.goto(`${inst.url}/#/settings/plugins`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=/does not expose its configuration/', { timeout: WAIT })
      expect(await page.getByRole('switch').count()).toBe(0)
      await shot(page, 'e37-sans-fichier')
      await context.close()
    }, 120_000)
  })
})
