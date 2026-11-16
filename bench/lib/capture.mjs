/**
 * One capture of the sweep (bench/sweep.mjs), importable on its own: the sweep
 * runs at import, so a test cannot take this out of it. `browser` and `page`
 * are only used through Playwright's surface, so a stub can stand in for both.
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Every wait for something to APPEAR (the shell, the proof) lasts this, for a pod that is busy. */
export const APPEAR_MS = 60_000

export const VIEWPORTS = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}

/** A wait that ran out is marked, so the sweep knows a slow page from a page that is wrong. */
async function appear(page, selector, options, describe) {
  try {
    return await page.waitForSelector(selector, { timeout: APPEAR_MS, ...options })
  } catch (error) {
    const seen = await Promise.resolve()
      .then(() => page.evaluate(() => (document.querySelector('.adestia-canvas, main, body')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)))
      .catch(() => '?')
    const failure = new Error(`${describe ?? 'a selector never appeared'} after ${Math.round(APPEAR_MS / 1000)} s: ${selector} (page shows: "${seen}")`)
    failure.appearTimeout = true
    failure.cause = error
    throw failure
  }
}

/**
 * Take one picture. `env`: `{ outDir, locale, conversations }`.
 * Returns the file written.
 */
export async function capture(browser, base, screen, theme, size, env) {
  const context = await browser.newContext({
    ...VIEWPORTS[size],
    colorScheme: theme,
    locale: env.locale ?? 'en-US',
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
  })
  const page = await context.newPage()
  try {
    // Explicit theme, so a skin that declares its own scheme does not decide for us.
    const chat = screen.chat ? env.conversations[screen.chat] : undefined
    const tabs = screen.chat ? JSON.stringify({ open: [chat], active: chat }) : undefined
    await page.addInitScript(
      ([themeName, tabState]) => {
        try {
          localStorage.setItem('adestia.theme', themeName)
          if (tabState) localStorage.setItem('adestia.tabs', tabState)
        } catch {
          // storage refused: the visit still renders
        }
      },
      [theme, tabs],
    )

    if (screen.signedIn) {
      await page.goto(`${base}/auth/login?returnTo=%2F`, { waitUntil: 'domcontentloaded' })
      await appear(page, '.adestia-chat', {}, 'the chat shell never appeared')
    }
    await screen.before?.(page, { base })
    await page.goto(`${base}/#${screen.route ?? '/'}`, { waitUntil: 'domcontentloaded' })
    if (screen.reload) await page.reload({ waitUntil: 'domcontentloaded' })
    if (screen.shell !== 'none') await appear(page, '.adestia-chat', {}, 'the chat shell never appeared')

    if (screen.offline) await goOffline(page, context)

    // The phone shows one of two screens; the picture must show the screen's own.
    if (size === 'phone' && screen.shell !== 'none') {
      const want = screen.shell ?? 'canvas'
      if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== want && want === 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await appear(page, `.adestia-shell[data-screen="${want}"]`, {}, 'the shell screen never appeared')
    }

    await screen.open?.(page)

    // Say what the page showed instead: a slow load and a broken one read the same otherwise.
    await appear(page, screen.proof, { state: 'visible' }, 'the selector that proves the screen never appeared')
    // Settle: transitions, web fonts, the second render of a view that loads.
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(700)

    if (await page.locator('.adestia-gate__card--loading').count()) throw new Error('a loading screen is shown (.adestia-gate__card--loading)')
    if (!screen.fatalOk && (await page.locator('.adestia-gate__card--fatal').count())) {
      const said = (await page.locator('.adestia-gate__card--fatal').first().innerText()).replace(/\s+/g, ' ').slice(0, 160)
      throw new Error(`an error screen is shown (.adestia-gate__card--fatal): ${said}`)
    }

    const file = join(env.outDir, `${screen.id}-${screen.name}-${theme}-${size}.png`)
    await page.screenshot({ path: file })
    if ((await stat(file)).size < 500) throw new Error(`the capture is empty (${file})`)
    await screen.after?.(page)
    return file
  } finally {
    await context.close()
  }
}

/**
 * A screen whose capture ran out waiting is taken once more in a fresh context
 * (the pod may have been busy at that moment); any other failure, and a second
 * wait that runs out too, counts. The final message names the missing proof and the second try.
 */
export async function captureWithRetry(browser, base, screen, theme, size, env) {
  try {
    return await capture(browser, base, screen, theme, size, env)
  } catch (first) {
    if (!first?.appearTimeout) throw first
    try {
      return await capture(browser, base, screen, theme, size, env)
    } catch (second) {
      if (second?.appearTimeout) second.message = `${second.message} — second attempt, after a first that also timed out`
      throw second
    }
  }
}

/** E-21: let the service worker cache the shell, cut the network, reload. */
async function goOffline(page, context) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(
    async () => {
      const names = await caches.keys()
      const entries = await Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys())))
      return entries.flat().length >= 5
    },
    undefined,
    { timeout: 20_000 },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await appear(page, '.adestia-chat', {}, 'the chat shell never appeared')
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
}
