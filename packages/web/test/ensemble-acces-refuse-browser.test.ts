/**
 * Feature adestia-acces-refuse vue depuis son besoin seul, par un navigateur piloté sur le banc
 * (`bench/launch.mjs --seed oidc`, fournisseur `bench/oidc-stub.mjs` : alice est dans le groupe
 * autorisé, visiteur n'y est pas).
 *
 * Besoin (message « Livre » de la fiche, docs/parcours.md P-1 étapes 3, 4 et 8, docs/ecrans.md E-1) :
 *  - L1 un compte hors des groupes autorisés voit une page à la charte (pas le JSON brut) qui dit
 *    quel compte est connecté et qu'il n'a pas accès, avec un bouton « Se déconnecter » ;
 *  - L2 « Se déconnecter » ferme aussi la session du fournisseur : on arrive à son écran de
 *    connexion (après « Se connecter » de la SignInGate, P-1 étape 4), jamais reconnecté d'office ;
 *  - L3 un compte autorisé entre ensuite normalement ;
 *  - L4 sans end_session_endpoint, le repli amène quand même à un écran où choisir un autre compte ;
 *  - L5 la déconnexion d'un compte autorisé (menu des réglages) partage le mécanisme (P-1 étape 8).
 *
 * Il faut `npm run build` avant, et Playwright de l'environnement. Captures :
 * ACCES_REFUSE_SHOTS=<dossier hors de l'arbre>.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { get } from 'node:https'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newBrowser, playwright } from './charte-browser.js'

interface Loc {
  first(): Loc
  click(o?: { timeout?: number }): Promise<void>
  waitFor(o?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>
  isVisible(): Promise<boolean>
  count(): Promise<number>
  textContent(): Promise<string | null>
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>
}
interface P {
  goto(url: string, o?: { waitUntil?: string }): Promise<unknown>
  reload(o?: { waitUntil?: string }): Promise<unknown>
  url(): string
  locator(s: string): Loc
  getByRole(role: string, o?: { name?: string | RegExp }): Loc
  getByText(t: string | RegExp, o?: { exact?: boolean }): Loc
  evaluate<R, A>(fn: (a: A) => R | Promise<R>, a: A): Promise<R>
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>
  screenshot(o: { path: string }): Promise<unknown>
}
interface Ctx {
  newPage(): Promise<P>
  addCookies(c: { name: string; value: string; url: string }[]): Promise<void>
  cookies(): Promise<{ name: string; value: string }[]>
  close(): Promise<void>
}
interface B {
  newContext(o: Record<string, unknown>): Promise<Ctx>
  close(): Promise<void>
}

vi.setConfig({ testTimeout: 60_000 })
const SHOTS = process.env.ACCES_REFUSE_SHOTS
const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const T = 20_000
const SIGN_OUT = /^(Se déconnecter|Sign out)$/
const SIGN_IN = /^(Se connecter|Sign in)$/
const DESK = { viewport: { width: 1440, height: 900 }, locale: 'fr-FR', ignoreHTTPSErrors: true }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'fr-FR', ignoreHTTPSErrors: true }

interface Inst {
  url: string
  child: ChildProcess
}
const children = new Set<ChildProcess>()
afterAll(() => {
  for (const c of children) c.kill('SIGTERM')
})

function launch(extra: string[] = [], locale = 'fr'): Promise<Inst> {
  const child = spawn(execPath, [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', '--seed', 'oidc', '--locale', locale, ...extra], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let err = ''
  child.stderr?.on('data', (c: Buffer) => (err += c))
  return new Promise((ok, ko) => {
    let out = ''
    child.stdout?.on('data', (c: Buffer) => {
      out += c
      const m = /listening on (\S+)/.exec(out)
      if (m) ok({ url: m[1] as string, child })
    })
    child.once('exit', (code) => ko(new Error(`launcher exited (${code}): ${err.slice(-300)}`)))
  })
}
const stop = (i?: Inst) => i?.child.kill('SIGTERM')

/** The provider's origin, read from where the product's own /auth/login sends the browser. */
async function issuerOf(base: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, { redirect: 'manual' })
  return new URL(res.headers.get('location') as string).origin
}
/** Makes the provider's next silent sign-in the given account's, its own session alive again (the stub's `as` choice). */
function signAs(issuer: string, user: 'alice' | 'visiteur'): Promise<void> {
  return new Promise((ok, ko) => {
    get(`${issuer}/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%2F&as=${user}`, { rejectUnauthorized: false }, (res) => {
      res.resume()
      res.on('end', () => (res.statusCode === 302 ? ok() : ko(new Error(`authorize ${res.statusCode}`))))
    }).on('error', ko)
  })
}

let browser: B
let main: Inst
let fallback: Inst
let mainIssuer: string
let fallbackIssuer: string

beforeAll(async () => {
  if (!playwright) throw new Error('Playwright absent: ces tests ne se passent pas de navigateur')
  browser = (await newBrowser()) as unknown as B
  ;[main, fallback] = await Promise.all([launch(), launch(['--no-end-session'])])
  ;[mainIssuer, fallbackIssuer] = await Promise.all([issuerOf(main.url), issuerOf(fallback.url)])
}, 120_000)
afterAll(async () => {
  await browser?.close()
  stop(main)
  stop(fallback)
})

const shot = async (page: P, name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

/** Signs `user` in through the product's own door and returns the page where the browser lands. */
async function signIn(inst: Inst, issuer: string, user: 'alice' | 'visiteur', opts: Record<string, unknown> = DESK) {
  await signAs(issuer, user)
  const context = await browser.newContext(opts)
  const page = await context.newPage()
  await page.goto(`${inst.url}/auth/login?returnTo=%2F`, { waitUntil: 'domcontentloaded' })
  return { context, page }
}
const refusedSentence = (page: P) => page.getByText(/Connecté en tant que Visiteur.{1,4}ce compte n.a pas accès à cette instance/)

/** Walks the refused visitor from the gate to the provider's account choice. */
async function signOutToProvider(page: P) {
  await page.getByRole('button', { name: SIGN_OUT }).first().click({ timeout: T })
  // the proof that the sign-out went through: the refused gate is gone and the sign-in gate stands
  await page.getByRole('link', { name: SIGN_IN }).first().waitFor({ state: 'visible', timeout: T })
  await page.getByRole('link', { name: SIGN_IN }).first().click({ timeout: T })
  await page.getByText('Pick an account').waitFor({ state: 'visible', timeout: T })
}
const pick = async (page: P, name: string) => {
  await page.getByRole('link', { name }).first().click({ timeout: T })
  await page.locator('.adestia-chat').first().waitFor({ state: 'visible', timeout: T })
}

describe('un compte hors des groupes autorisés (feature adestia-acces-refuse)', () => {
  it('voit une page à la charte qui nomme le compte, sans JSON brut, avec « Se déconnecter »', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'visiteur')
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    await page.getByRole('button', { name: SIGN_OUT }).first().waitFor({ state: 'visible', timeout: T })
    const body = (await page.locator('body').textContent()) ?? ''
    expect(body).not.toContain('your account is not in a group allowed to use this instance')
    expect(body).not.toContain('{"error"')
    expect(page.url()).toBe(`${main.url}/`)
    expect(await page.locator('.adestia-chat').count()).toBe(0)
    await shot(page, 'refuse-bureau')
    await context.close()
  })

  it('n\'obtient aucune session : l\'API de l\'instance répond 401 et la page ne montre pas le shell', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'visiteur')
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    const status = await page.evaluate(async () => (await fetch('/api/instance')).status)
    expect(status).toBe(401)
    const conv = await page.evaluate(async () => (await fetch('/api/conversations')).status)
    expect(conv).toBe(401)
    await context.close()
  })

  it('sur un téléphone, la page tient dans la largeur et le bouton est entièrement visible', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'visiteur', PHONE)
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    const box = await page.getByRole('button', { name: SIGN_OUT }).first().boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
    await shot(page, 'refuse-telephone')
    await context.close()
  })

  it('en anglais, le bouton s\'appelle « Sign out »', async () => {
    const en = await launch([], 'en')
    try {
      const issuer = await issuerOf(en.url)
      const { context, page } = await signIn(en, issuer, 'visiteur', { ...DESK, locale: 'en-US' })
      await page.getByRole('button', { name: 'Sign out' }).first().waitFor({ state: 'visible', timeout: T })
      expect(await page.getByText('Visiteur').first().isVisible()).toBe(true)
      await context.close()
    } finally {
      stop(en)
    }
  })

  it('« Se déconnecter » ferme la session du fournisseur : il redemande le compte au lieu de reconnecter Visiteur, et alice entre normalement', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'visiteur')
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    await signOutToProvider(page)
    await shot(page, 'fournisseur-choix')
    await pick(page, 'alice')
    expect(await refusedSentence(page).count()).toBe(0)
    expect(page.url().startsWith(`${main.url}/`)).toBe(true)
    // the refused cookie is gone: a reload shows the shell, not the gate
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.adestia-chat').first().waitFor({ state: 'visible', timeout: T })
    expect(await page.getByRole('button', { name: SIGN_OUT }).count()).toBeGreaterThanOrEqual(0)
    const status = await page.evaluate(async () => (await fetch('/api/instance')).status)
    expect(status).toBe(200)
    await shot(page, 'alice-entre')
    await context.close()
  })

  it('après la déconnexion, recharger ne ramène pas la page « refusé » : le cookie de refus est effacé', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'visiteur')
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    await page.getByRole('button', { name: SIGN_OUT }).first().click({ timeout: T })
    await page.getByRole('link', { name: SIGN_IN }).first().waitFor({ state: 'visible', timeout: T })
    expect(await refusedSentence(page).count()).toBe(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: SIGN_IN }).first().waitFor({ state: 'visible', timeout: T })
    expect(await refusedSentence(page).count()).toBe(0)
    expect((await context.cookies()).map((c) => c.name)).not.toContain('adestia_refused')
    await context.close()
  })

  it('sans end_session_endpoint, le repli amène quand même au choix d\'un autre compte, et alice entre', async () => {
    const { context, page } = await signIn(fallback, fallbackIssuer, 'visiteur')
    await refusedSentence(page).waitFor({ state: 'visible', timeout: T })
    await page.getByRole('button', { name: SIGN_OUT }).first().click({ timeout: T })
    // without an end_session_endpoint the provider is asked to show its sign-in (prompt=login), at once
    // or after the sign-in gate: either way the account choice must come, never Visiteur again
    const choice = page.getByText('Pick an account')
    const gate = page.getByRole('link', { name: SIGN_IN }).first()
    for (let i = 0; i < 200 && !(await choice.isVisible()); i++) {
      if (await gate.isVisible()) await gate.click({ timeout: T })
      await page.evaluate(() => new Promise((r) => setTimeout(r, 100)))
    }
    await choice.waitFor({ state: 'visible', timeout: 1000 })
    await shot(page, 'repli-choix')
    await pick(page, 'alice')
    expect(await refusedSentence(page).count()).toBe(0)
    await context.close()
  })
})

describe('sans compte refusé', () => {
  it('un navigateur neuf voit la porte « Se connecter », pas la page « refusé »', async () => {
    const context = await browser.newContext(DESK)
    const page = await context.newPage()
    await page.goto(`${main.url}/`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: SIGN_IN }).first().waitFor({ state: 'visible', timeout: T })
    expect(await page.getByRole('button', { name: SIGN_OUT }).count()).toBe(0)
    expect(await page.getByText(/n.a pas accès à cette instance/).count()).toBe(0)
    await context.close()
  })

  it('un cookie de refus forgé ne fait afficher aucun nom', async () => {
    const context = await browser.newContext(DESK)
    const forged = Buffer.from(JSON.stringify({ displayName: 'Mallory', userId: 'x', exp: Date.now() + 600_000 })).toString('base64url')
    await context.addCookies([{ name: 'adestia_refused', value: `${forged}.AAAA`, url: main.url }])
    const page = await context.newPage()
    await page.goto(`${main.url}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('.adestia-gate').first().waitFor({ state: 'visible', timeout: T })
    expect(await page.getByText('Mallory').count()).toBe(0)
    expect(await page.locator('.adestia-chat').count()).toBe(0)
    await context.close()
  })

  it('un compte autorisé entre sans voir la page « refusé »', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'alice')
    await page.locator('.adestia-chat').first().waitFor({ state: 'visible', timeout: T })
    expect(await page.getByText(/n.a pas accès à cette instance/).count()).toBe(0)
    await context.close()
  })

  it('la déconnexion d\'un compte autorisé (menu des réglages) ferme aussi la session du fournisseur', async () => {
    const { context, page } = await signIn(main, mainIssuer, 'alice')
    await page.locator('.adestia-chat').first().waitFor({ state: 'visible', timeout: T })
    await page.locator('.adestia-cog > button').first().click({ timeout: T })
    await page.locator('.adestia-cog__signout').first().click({ timeout: T })
    await page.getByRole('link', { name: SIGN_IN }).first().waitFor({ state: 'visible', timeout: T })
    await page.getByRole('link', { name: SIGN_IN }).first().click({ timeout: T })
    // alice is still the provider's current user: only a closed provider session asks who signs in
    await page.getByText('Pick an account').waitFor({ state: 'visible', timeout: T })
    await context.close()
  })
})
