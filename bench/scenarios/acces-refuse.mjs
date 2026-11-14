/**
 * E-1 refused: a signed-in visitor outside the groups sees who they are, signs
 * out, and another account enters. Run after `npm run build`:
 *   node bench/scenarios/acces-refuse.mjs [--no-end-session]
 * Pictures land in bench/shots/acces-refuse/.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const launcher = fileURLToPath(new URL('../launch.mjs', import.meta.url))
const out = fileURLToPath(new URL('../shots/acces-refuse/', import.meta.url))
await mkdir(out, { recursive: true })
const extra = process.argv.includes('--no-end-session') ? ['--no-end-session'] : []
const child = spawn(execPath, [launcher, '--engine', 'fake', '--seed', 'oidc', ...extra], { stdio: ['ignore', 'pipe', 'inherit'] })
const url = await new Promise((resolve, reject) => {
  let buf = ''
  child.stdout.on('data', (c) => { buf += c; const m = /listening on (\S+)/.exec(buf); if (m) resolve(m[1]) })
  child.once('exit', (code) => reject(new Error(`launcher exited ${code}`)))
})
const { chromium } = loadPlaywright()
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] })
try {
  // Learn the provider's address from the first redirect, then pose as the visitor.
  const probe = await fetch(`${url}/auth/login`, { redirect: 'manual' })
  const issuer = new URL(probe.headers.get('location')).origin
  const tag = extra.length ? 'fallback' : 'sso'
  for (const [device, viewport] of [['desk', { width: 1280, height: 800 }], ['phone', { width: 390, height: 780 }]]) {
    for (const scheme of ['light', 'dark']) {
      await fetch(`${issuer}/__as?user=visiteur`)
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      await page.goto(url)
      await page.getByRole('link', { name: /sign in|se connecter/i }).click()
      await page.getByText(/Signed in as|Connecté en tant que/).waitFor({ timeout: 15000 })
      const text = await page.getByRole('alert').innerText()
      if (!text.includes('Visiteur')) throw new Error(`no account name: ${text}`)
      await page.screenshot({ path: `${out}${tag}-refused-${device}-${scheme}.png` })
      if (device === 'phone' && scheme === 'dark') {
        await page.getByRole('button', { name: /sign out|déconnecter/i }).click()
        await page.waitForLoadState('load')
        await page.screenshot({ path: `${out}${tag}-after-signout.png` })
        console.log('after sign-out:', page.url())
        const signIn = page.getByRole('link', { name: /sign in|se connecter/i })
        if (await signIn.count()) { await signIn.click(); await page.waitForLoadState('load') }
        console.log('then:', page.url(), JSON.stringify((await page.locator('body').innerText()).slice(0, 120)))
        await page.screenshot({ path: `${out}${tag}-provider-form.png` })
        await page.getByRole('link', { name: 'alice' }).click().catch(() => {})
        await page.waitForLoadState('networkidle').catch(() => {})
        console.log('entered:', page.url())
        await page.screenshot({ path: `${out}${tag}-alice-in.png` })
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  child.kill('SIGTERM')
}
