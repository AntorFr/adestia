/**
 * E-17/E-18, host matrix: node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-permission.mjs
 * Strings checked in en/fr: Permission required; Refuse; Just this once; Always;
 * No lasting rule for this one — the engine proposed none.; Signature requested;
 * A held action waits for your signature.; A standing authorisation asks for your signature.;
 * Action signed — the agent resumes it.; Signature refused.; Request lapsed unsigned.;
 * until; Sign; I signed it; Signature; Signature ceremony; Open in a tab; Close;
 * If the passkey does not open here, sign in a tab instead.
 * Engine titles/reasons, the thread's text and the façade are seeded content.
 * Copilot/Codex permission behaviour is only a stand-in; this proves the shell.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { THREADS } from '../seed/chat-permission.mjs'
import { SIGNATURE_ORIGIN } from '../seed/_scripts.mjs'

export const seed = 'chat-permission'
const words = {
  en: { permission: 'Permission required', deny: 'Refuse', once: 'Just this once', always: 'Always', noRule: 'No lasting rule for this one — the engine proposed none.', requested: 'Signature requested', pending: 'A held action waits for your signature.', grant: 'A standing authorisation asks for your signature.', signed: 'Action signed — the agent resumes it.', denied: 'Signature refused.', expired: 'Request lapsed unsigned.', until: 'until', sign: 'Sign', signedIt: 'I signed it', signature: 'Signature', ceremony: 'Signature ceremony', tab: 'Open in a tab', close: 'Close', hint: 'If the passkey does not open here, sign in a tab instead.' },
  fr: { permission: 'Autorisation demandée', deny: 'Refuser', once: 'Cette fois', always: 'Toujours', noRule: "Pas d'autorisation durable ici — le moteur n'a proposé aucune règle.", requested: 'Signature demandée', pending: 'Une action attend votre signature.', grant: 'Une autorisation à l’avance attend votre signature.', signed: 'Action signée — l’agent la reprend.', denied: 'Signature refusée.', expired: 'Demande expirée sans signature.', until: 'jusqu’à', sign: 'Signer', signedIt: 'C’est signé', signature: 'Signature', ceremony: 'Cérémonie de signature', tab: 'Ouvrir dans un onglet', close: 'Fermer', hint: 'Si la passkey ne s’ouvre pas ici, signez dans un onglet.' },
}
function playwright() {
  for (const root of ['/usr/lib/node_modules', execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()]) {
    for (const name of ['playwright', 'playwright-core']) {
      try { return createRequire(`${root}/`)(name) } catch { /* next environment root */ }
    }
  }
  throw new Error('Playwright must come from the environment')
}

/** Measure the actual composited colours, including the skin's translucent card fill. */
async function contrast(locator, threshold = 4.5) {
  const pair = await locator.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    const rgb = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 1, 1)
    const ancestors = []
    for (let current = node; current; current = current.parentElement) ancestors.unshift(current)
    for (const ancestor of ancestors) {
      ctx.fillStyle = getComputedStyle(ancestor).backgroundColor
      ctx.fillRect(0, 0, 1, 1)
    }
    const background = rgb()
    ctx.fillStyle = getComputedStyle(node).color
    ctx.fillRect(0, 0, 1, 1)
    const foreground = rgb()
    const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = luminance(foreground), b = luminance(background)
    return { foreground, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
  })
  assert(pair.ratio >= threshold, JSON.stringify({ ...pair, threshold }))
  return { ...pair, threshold }
}

export default async function scenario(bench) {
  const base = process.env.BENCH_URL
  assert(base, 'BENCH_URL is required (run through chat-matrix.mjs)')
  const out = process.env.BENCH_OUT ?? 'bench/shots-chat-permission'
  const locale = process.env.BENCH_LOCALE ?? 'fr'
  const w = words[locale]
  await mkdir(out, { recursive: true })
  const browser = await playwright().chromium.launch({ args: ['--no-sandbox'] })
  const report = []
  try {
    for (const theme of ['light', 'dark']) for (const [format, width, height] of [['desk', 1440, 900], ['phone', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, locale, colorScheme: theme, ...(width < 820 ? { hasTouch: true, isMobile: true } : {}) })
      const page = await context.newPage()
      const id = THREADS[`${theme}-${format}`]
      const shoot = async (name) => {
        await page.screenshot({ path: join(out, `${theme}-${format}-${name}.png`) })
        console.log(`shot ${theme}-${format}-${name}`)
      }
      try {
        const colours = []
        await page.addInitScript(({ theme, id }) => {
          localStorage.setItem('adestia.theme', theme)
          localStorage.setItem('adestia.tabs', JSON.stringify({ open: [id], active: id }))
          localStorage.setItem('adestia.signatures', JSON.stringify({ signed: 'signed', denied: 'denied' }))
        }, { theme, id })
        // The origin and source checks are real; only the remote ceremony is a stand-in.
        await context.route(`${SIGNATURE_ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${w.ceremony}</title><body><h2>${w.ceremony}</h2><p>${w.pending}</p><button id=trouble>${w.sign}</button><script>document.getElementById('trouble').onclick=()=>parent.postMessage({source:'tessera-ceremony',stage:'assertion_err'},'*');parent.postMessage({source:'tessera-ceremony',stage:'loaded'},'*')</script></body></html>` }))
        await page.goto(base, { waitUntil: 'domcontentloaded' })
        const chat = page.locator('.adestia-chat')
        await chat.locator('.adestia-sign').first().waitFor()
        for (const text of [w.pending, w.grant, w.signed, w.denied, w.expired]) assert(await chat.getByText(text, { exact: true }).isVisible(), text)
        assert.equal(await chat.locator('.adestia-sign').first().getAttribute('aria-label'), w.requested)
        assert((await chat.locator('.adestia-sign__meta').first().textContent()).includes(w.until))
        for (const [state, icon] of [['pending', 'pen-line'], ['signed', 'check'], ['denied', 'x'], ['expired', 'clock']]) {
          assert(await chat.locator(`.adestia-sign--${state} .adestia-sign__glyph use[href="#adestia-i-${icon}"]`).count())
        }
        await chat.locator('.adestia-sign').first().scrollIntoViewIfNeeded()
        await shoot('signature-states')
        const opener = chat.getByRole('button', { name: w.sign, exact: true }).first()
        await opener.click()
        const dialog = page.getByRole('dialog', { name: w.signature, exact: true })
        await dialog.waitFor()
        assert.equal(await page.locator('.adestia-sheet').count(), 1)
        assert.equal(await dialog.locator('iframe').getAttribute('title'), w.ceremony)
        await page.frameLocator('iframe').getByRole('heading', { name: w.ceremony }).waitFor()
        assert.equal(await dialog.getByRole('link', { name: w.tab }).count(), 1)
        assert.equal(await dialog.getByRole('button', { name: w.close }).count(), 1)
        const panel = await dialog.boundingBox()
        if (width < 820) assert(Math.abs(panel.y + panel.height - height) < 1, JSON.stringify(panel))
        await shoot('sheet')
        await page.frameLocator('iframe').getByRole('button', { name: w.sign, exact: true }).click()
        await dialog.getByText(w.hint, { exact: true }).waitFor()
        colours.push(await contrast(dialog.locator('.adestia-sheet__hint')))
        await shoot('sheet-hint')
        await page.keyboard.press('Tab')
        assert(await dialog.evaluate((n) => n.contains(document.activeElement)), 'Tab leaving the ceremony stays in the sheet')
        await dialog.getByRole('link', { name: w.tab }).focus()
        // Focus starts at the header link, wraps backwards to the frame and returns on Escape.
        assert(await dialog.getByRole('link', { name: w.tab }).evaluate((n) => n === document.activeElement))
        await page.keyboard.press('Shift+Tab')
        assert(await dialog.locator('iframe').evaluate((n) => n === document.activeElement))
        // Escape in the parent document follows the shared Sheet's contract.
        await dialog.getByRole('button', { name: w.close }).focus()
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert(await opener.evaluate((n) => n === document.activeElement), 'Escape returns focus to the signing card')
        await shoot('focus-return')
        await opener.click()
        const popupReady = page.waitForEvent('popup')
        await dialog.getByRole('link', { name: w.tab }).click()
        const popup = await popupReady
        await popup.close()
        await dialog.waitFor({ state: 'hidden' })

        // The non-embedded ceremony keeps its existing "I signed it" path.
        await page.route('**/api/instance', async (route) => {
          const response = await route.fetch()
          const instance = await response.json()
          await route.fulfill({ json: { ...instance, signatures: { embed: false } } })
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await opener.waitFor()
        const tabReady = page.waitForEvent('popup')
        await opener.click()
        const tab = await tabReady
        await tab.close()
        await chat.getByRole('button', { name: w.signedIt }).waitFor()
        await chat.locator('.adestia-sign').first().scrollIntoViewIfNeeded()
        await shoot('opened-in-tab')

        for (const remembering of [true, false]) {
          const field = chat.locator('textarea')
          await field.fill(remembering ? 'permission durable' : 'permission once')
          await field.press('Enter')
          const ask = chat.getByRole('alertdialog', { name: w.permission })
          await ask.waitFor()
          assert.equal(await ask.getByRole('button', { name: w.always, exact: true }).count(), remembering ? 1 : 0)
          assert.equal(await ask.getByRole('button', { name: w.deny, exact: true }).count(), 1)
          assert.equal(await ask.getByRole('button', { name: w.once, exact: true }).count(), 1)
          assert.equal(await ask.getByText(w.noRule, { exact: true }).count(), remembering ? 0 : 1)
          assert(await ask.locator('use[href="#adestia-i-triangle-alert"]').count())
          for (const selector of ['.adestia-ask__text', '.adestia-ask__reason', '.adestia-ask__actions button']) colours.push(await contrast(ask.locator(selector).first()))
          colours.push(await contrast(ask.locator('.adestia-icon'), 3))
          if (remembering) colours.push(await contrast(ask.getByRole('button', { name: w.always, exact: true })))
          await shoot(remembering ? 'permission-durable' : 'permission-once')
          await ask.getByRole('button', { name: w.once, exact: true }).click()
          await ask.waitFor({ state: 'hidden' })
          // The fake engine holds until stopped; it makes no assertion about engine consent.
          await page.request.post(`${base}/api/turn/stop`, { data: { conversation: id } })
          await chat.locator('.adestia-composer__stop').waitFor({ state: 'hidden' })
          await chat.locator('.adestia-composer__send').waitFor()
        }
        report.push({ theme, format, locale, panel, colours, escapeFocusReturned: true, alwaysHiddenWithoutRule: true })
      } finally { await context.close() }
    }
  } finally { await browser.close() }
  await writeFile(join(out, 'permission-report.json'), JSON.stringify(report, null, 2) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
