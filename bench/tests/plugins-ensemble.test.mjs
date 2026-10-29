/**
 * `adestia-correctifs-plugins` seen from the need, through a real browser on a real instance
 * (seed `plugins-ensemble`, scripted engine): the plugins ask in the shared sheet instead of the
 * browser's dialogs (Q-20, E-25, E-26), speak the instance's language (E-23, E-27, E-31, B-16),
 * keep the walking map full size (E-28) and the scan focus on a phone (E-30), say one thing with amber
 * (E-31), write counts in the singular (E-25) and draw no emoji of their own in their chrome.
 *
 *   npm run build && node --test bench/tests/plugins-ensemble.test.mjs
 *
 * Every expected word is written by hand from docs/parcours.md (P-11, P-12) and docs/ecrans.md.
 * `ENSEMBLE_SKINS=alfred` and `ENSEMBLE_LOCALES=fr` narrow the matrix. Pictures: `bench/shots-ensemble/` (ignored by git).
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-ensemble')
mkdirSync(shots, { recursive: true })

function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()) } catch { /* fixed root only */ }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(`${dir}/`)(name) } catch { /* not here */ }
    }
  }
  throw new Error('playwright not found in the environment')
}
const { chromium } = loadPlaywright()

const SKINS = (process.env.ENSEMBLE_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.ENSEMBLE_LOCALES ?? 'en,fr').split(',')
const PICTO = /\p{Extended_Pictographic}/u

/** What the user reads, by locale: written by hand from the docs. */
const W = {
  en: {
    question: /Drop your layout and go back to Alfred['’]s\?/, cancel: 'Cancel', discard: 'Discard my layout',
    refused: 'Gesture refused', impossible: 'Gesture impossible', close: 'Close',
    walk: 'Walking mode', leaveWalk: 'Leave walking mode', late: 'late',
    oneP: 'MEL8 · 1 piece', manyP: 'MEL19 · 5 pieces', badOne: /\b1 pieces\b/,
    march: 'March 14, 2026', dec: 'December 31, 2026', loc: 'en-US',
  },
  fr: {
    question: /Abandonner votre mise en plan et reprendre celle d['’]Alfred ?\?/, cancel: 'Annuler', discard: 'Abandonner ma mise en plan',
    refused: 'Geste refusé', impossible: 'Geste impossible', close: 'Fermer',
    walk: 'Mode balade', leaveWalk: 'Quitter le mode balade', late: 'en retard',
    oneP: 'MEL8 · 1 pièce', manyP: 'MEL19 · 5 pièces', badOne: /\b1 pièces\b/,
    march: '14 mars 2026', dec: '31 décembre 2026', loc: 'fr-FR',
  },
}

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'ensemble-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'plugins-ensemble', '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({
          url: match[1], workspace: join(data, 'workspace'),
          stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })),
        })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

const LAYOUT = (workspace) => join(workspace, 'pages/projets/caisson/assets/workbook-layout.json')
const HAND_LAYOUT = JSON.stringify({ poses: { 'BLT-A1-CÔTÉ-D': { plaque: 'P1', x: 20, y: 20 } }, bandes: {} })
const VOYAGE_STATE = (workspace) => join(workspace, 'pages/voyages/corse/assets/voyage-state.json')

let browser
before(async () => {
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
})
after(async () => { await browser?.close() })

for (const skin of SKINS) for (const locale of LOCALES) describe(`${skin} / ${locale}`, () => {
  const w = W[locale]
  const tag = `${skin}-${locale}`
  let inst
  before(async () => { inst = await startInstance(skin, locale) })
  after(async () => { await inst?.stop() })

  /** A page in a fresh context; every native dialog is recorded, then dismissed. */
  async function session({ phone = false, dark = false, size } = {}, body) {
    const context = await browser.newContext({
      viewport: size ?? (phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }),
      colorScheme: dark ? 'dark' : 'light', locale: w.loc, hasTouch: phone, isMobile: phone, permissions: ['camera', 'geolocation'],
      geolocation: { latitude: 48.1, longitude: -2.1 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const natives = []
    page.on('dialog', (d) => { natives.push(`${d.type()}: ${d.message()}`); d.dismiss() })
    await page.addInitScript((value) => localStorage.setItem('adestia.theme', value), dark ? 'dark' : 'light')
    try { await body(page, natives) } finally { await context.close() }
  }
  async function open(page, route, proof, phone = false) {
    await page.goto(`${inst.url}/#${route}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.adestia-shell').waitFor()
    if (phone && (await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
      await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
    }
    await proof(page)
    await page.evaluate(() => document.fonts.ready)
  }
  const shot = (page, name) => page.screenshot({ path: join(shots, `${tag}-${name}.png`) })
  const activeInside = (page, selector) => page.evaluate((sel) => !!document.activeElement?.closest(sel), selector)

  // ── E-25 · the layout reset asks in the plugin's sheet (Q-20, B-15) ─────────
  for (const [mode, opts] of [['desk light', {}], ['phone dark', { phone: true, dark: true }]]) {
    describe(`atelier reset, ${mode}`, () => {
      const atelier = async (page) => {
        writeFileSync(LAYOUT(inst.workspace), HAND_LAYOUT)
        await open(page, '/atelier/caisson', (p) => p.getByText('MEL19').first().waitFor(), opts.phone)
        await page.locator('#wbedit').click()
        await page.locator('#wbreset').waitFor()
      }
      const sheet = (page) => page.getByRole('dialog')

      test('reset_asks_in_a_sheet_with_the_question_and_two_buttons_never_a_native_dialog', async () => {
        await session(opts, async (page, natives) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          assert.match(await sheet(page).innerText(), w.question)
          assert.equal(await sheet(page).getByRole('button', { name: w.cancel, exact: true }).count(), 1)
          assert.equal(await sheet(page).getByRole('button', { name: w.discard, exact: true }).count(), 1)
          await shot(page, `reset-sheet-${mode.replace(' ', '-')}`)
          assert.deepEqual(natives, [])
        })
      })

      test('cancel_has_the_focus_when_the_sheet_opens', async () => {
        await session(opts, async (page) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          const focused = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim())
          assert.equal(focused, w.cancel)
        })
      })

      test('escape_cancels_nothing_moves_and_focus_returns_to_the_reset_button', async () => {
        await session(opts, async (page, natives) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          await page.keyboard.press('Escape')
          await sheet(page).waitFor({ state: 'detached' })
          assert.equal(await page.evaluate(() => document.activeElement?.id), 'wbreset')
          assert.deepEqual(JSON.parse(readFileSync(LAYOUT(inst.workspace), 'utf8')), JSON.parse(HAND_LAYOUT))
          assert.deepEqual(natives, [])
        })
      })

      test('cancel_button_closes_and_keeps_the_layout', async () => {
        await session(opts, async (page) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).getByRole('button', { name: w.cancel, exact: true }).click()
          await sheet(page).waitFor({ state: 'detached' })
          assert.equal(await page.locator('#wbreset').count(), 1)
          assert.deepEqual(JSON.parse(readFileSync(LAYOUT(inst.workspace), 'utf8')), JSON.parse(HAND_LAYOUT))
        })
      })

      test('scrim_click_cancels_and_keeps_the_layout', async () => {
        await session(opts, async (page) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          await page.mouse.click(3, 3)
          await sheet(page).waitFor({ state: 'detached' })
          assert.deepEqual(JSON.parse(readFileSync(LAYOUT(inst.workspace), 'utf8')), JSON.parse(HAND_LAYOUT))
        })
      })

      test('tab_and_shift_tab_keep_the_focus_inside_the_sheet', async () => {
        await session(opts, async (page) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.equal(await activeInside(page, '[role=dialog]'), true, `Tab ${i + 1}`) }
          for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); assert.equal(await activeInside(page, '[role=dialog]'), true, `Shift+Tab ${i + 1}`) }
        })
      })

      if (opts.phone) test('sheet_sits_at_the_bottom_of_the_phone_screen', async () => {
        await session(opts, async (page) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await sheet(page).waitFor()
          const box = await sheet(page).boundingBox()
          assert.ok(Math.abs(box.y + box.height - 844) <= 2, `panel bottom ${box.y + box.height} of 844`)
          assert.ok(box.width >= 380, `panel width ${box.width}`)
        })
      })

      test('discard_drops_the_hand_layout_the_chip_goes_and_the_file_has_no_pose', async () => {
        await session(opts, async (page, natives) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          const answered = page.waitForResponse((r) => r.url().includes('/api/plugin/atelier/layout') && r.request().method() === 'POST')
          await sheet(page).getByRole('button', { name: w.discard, exact: true }).click()
          await answered
          await sheet(page).waitFor({ state: 'detached' })
          await shot(page, `reset-discarded-${mode.replace(' ', '-')}`)
          assert.deepEqual(natives, [])
          const stored = JSON.parse(readFileSync(LAYOUT(inst.workspace), 'utf8'))
          assert.deepEqual(Object.keys(stored.poses ?? {}), [], `layout file after discard: ${JSON.stringify(stored)}`)
          assert.equal(await page.locator('#wbreset').count(), 0, 'the hand-back chip is still there')
        })
      })

      test('request_failing_after_the_answer_closes_the_sheet_without_a_native_dialog', async () => {
        await session(opts, async (page, natives) => {
          await atelier(page)
          await page.locator('#wbreset').click()
          await page.route('**/api/plugin/atelier/layout', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()))
          await sheet(page).getByRole('button', { name: w.discard, exact: true }).click()
          await sheet(page).waitFor({ state: 'detached' })
          assert.deepEqual(natives, [])
          assert.deepEqual(JSON.parse(readFileSync(LAYOUT(inst.workspace), 'utf8')), JSON.parse(HAND_LAYOUT))
        })
      })
    })
  }

  // ── E-26 · a refused or impossible gesture is said in the plugin's sheet ─────
  for (const [mode, opts] of [['desk light', {}], ['phone dark', { phone: true, dark: true }]]) {
    describe(`voyages refusal, ${mode}`, () => {
      const SERVER_TEXT = 'Carte déjà déplacée ailleurs'
      const card = (page) => page.locator('main').getByText('Chez Anna', { exact: true }).first()
      const refuse = async (page, how) => {
        rmSync(VOYAGE_STATE(inst.workspace), { force: true })
        await open(page, '/voyages/corse', (p) => p.getByText('Chez Anna', { exact: true }).first().waitFor(), opts.phone)
        await page.route('**/api/plugin/voyages/state', (route) => {
          if (route.request().method() !== 'POST') return route.continue()
          return how === 'abort' ? route.abort() : route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: SERVER_TEXT }) })
        })
        await card(page).click()
        await page.getByRole('dialog').waitFor()
        await page.getByRole('dialog').getByRole('button', { name: /^\s*(Écarter|Dismiss)/ }).click()
        await page.getByRole('dialog').getByRole('heading', { name: how === 'abort' ? w.impossible : w.refused }).waitFor()
      }

      test('refused_gesture_is_said_in_a_sheet_titled_with_the_server_text_and_one_close', async () => {
        await session(opts, async (page, natives) => {
          await refuse(page, 'refuse')
          const dialog = page.getByRole('dialog')
          assert.match(await dialog.innerText(), new RegExp(SERVER_TEXT))
          assert.equal(await dialog.locator('footer').getByRole('button', { name: w.close, exact: true }).count(), 1)
          await shot(page, `refusal-sheet-${mode.replace(' ', '-')}`)
          assert.deepEqual(natives, [])
        })
      })

      test('refusal_sheet_closes_by_escape_and_focus_returns_to_the_card', async () => {
        await session(opts, async (page) => {
          await refuse(page, 'refuse')
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'detached' })
          const holder = await page.evaluate(() => document.activeElement?.closest('[class*=card], [class*=vc], [draggable], button')?.textContent ?? document.activeElement?.textContent ?? '')
          assert.match(holder, /Chez Anna/)
        })
      })

      test('refusal_sheet_closes_by_scrim_and_by_close_button', async () => {
        await session(opts, async (page) => {
          await refuse(page, 'refuse')
          await page.mouse.click(3, 3)
          await page.getByRole('dialog').waitFor({ state: 'detached' })
          await card(page).click()
          await page.getByRole('dialog').getByRole('button', { name: /^\s*(Écarter|Dismiss)/ }).click()
          await page.getByRole('dialog').getByRole('heading', { name: w.refused }).waitFor()
          await page.getByRole('dialog').locator('footer').getByRole('button', { name: w.close, exact: true }).click()
          await page.getByRole('dialog').waitFor({ state: 'detached' })
        })
      })

      test('unreachable_server_says_gesture_impossible', async () => {
        await session(opts, async (page, natives) => {
          await refuse(page, 'abort')
          assert.equal(await page.getByRole('dialog').locator('footer').getByRole('button', { name: w.close, exact: true }).count(), 1)
          assert.deepEqual(natives, [])
        })
      })

      if (!opts.phone) test('card_dragged_onto_a_day_and_refused_is_back_in_the_tray_when_the_sheet_closes', async () => {
        await session(opts, async (page) => {
          rmSync(VOYAGE_STATE(inst.workspace), { force: true })
          await open(page, '/voyages/corse', (p) => p.getByText('Chez Anna', { exact: true }).first().waitFor(), opts.phone)
          await page.route('**/api/plugin/voyages/state', (route) => (route.request().method() === 'POST'
            ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: SERVER_TEXT }) }) : route.continue()))
          const day = page.locator('main').getByText(/lun\.? 9 nov\.?|Mon,? Nov\.? 9/i).first()
          await card(page).dragTo(day)
          await page.getByRole('dialog').getByRole('heading', { name: w.refused }).waitFor()
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'detached' })
          // the card is a suggestion again: the tray lists it, and the day it was dropped on holds no card
          assert.equal(await page.locator('main').getByText('Chez Anna', { exact: true }).count(), 1)
        })
      })
    })
  }

  // ── E-28 · walking mode: the map fills the screen ──────────────────────────
  for (const [mode, opts] of [['desk', {}], ['phone', { phone: true }]]) {
    test(`walking_mode_map_fills_the_screen_and_returns_to_its_size, ${mode}`, async () => {
      await session(opts, async (page) => {
        const vp = page.viewportSize()
        await open(page, '/page/balades/val-sans-retour.md', (p) => p.getByRole('button', { name: w.walk }).waitFor(), opts.phone)
        const map = page.locator('.pc-map')
        await map.waitFor()
        const before = await map.boundingBox()
        await page.getByRole('button', { name: w.walk }).click()
        const exit = page.getByRole('button', { name: w.leaveWalk })
        await exit.waitFor()
        await page.waitForFunction(() => document.querySelector('.pc-map').getBoundingClientRect().height > 500)
        const walking = await map.boundingBox()
        const hud = await exit.boundingBox()
        await shot(page, `walk-${mode}`)
        assert.equal(Math.round(walking.x), 0); assert.equal(Math.round(walking.y), 0)
        assert.equal(Math.round(walking.width), vp.width, `walking map width ${walking.width} of ${vp.width}`)
        assert.ok(walking.height > before.height * 1.5, `walking map ${walking.height}px high, was ${before.height}`)
        assert.ok(walking.y + walking.height >= hud.y - 120, `map bottom ${walking.y + walking.height}, exit button at ${hud.y}`)
        assert.ok(walking.height >= vp.height * 0.7, `map ${walking.height} of a ${vp.height} screen`)
        // the track layer is redrawn to cover the map's box (it may overhang by the HUD's growth on a phone); the box settles once the walking HUD has its text (position fix)
        const fits = () => { const m = document.querySelector('.pc-map').getBoundingClientRect(); const l = document.querySelector('.pc-map svg').getBoundingClientRect(); return Math.abs(l.width - m.width) <= 2 && l.height >= m.height - 2 }
        await page.waitForFunction(fits, null, { timeout: 5000 }).catch(async () => {
          const got = await page.evaluate(() => { const m = document.querySelector('.pc-map').getBoundingClientRect(); const l = document.querySelector('.pc-map svg').getBoundingClientRect(); return `map ${Math.round(m.width)}x${Math.round(m.height)}, track layer ${Math.round(l.width)}x${Math.round(l.height)}` })
          assert.fail(`walking mode: ${got}`)
        })
        await exit.click()
        await page.getByRole('button', { name: w.walk }).waitFor()
        await page.waitForFunction((h) => Math.abs(document.querySelector('.pc-map').getBoundingClientRect().height - h) < 4, before.height)
      })
    })
  }

  test('walking_map_redraws_when_the_window_is_resized', async () => {
    await session({}, async (page) => {
      await open(page, '/page/balades/val-sans-retour.md', (p) => p.getByRole('button', { name: w.walk }).waitFor())
      await page.getByRole('button', { name: w.walk }).click()
      await page.getByRole('button', { name: w.leaveWalk }).waitFor()
      await page.setViewportSize({ width: 1100, height: 700 })
      await page.waitForFunction(() => Math.round(document.querySelector('.pc-map').getBoundingClientRect().width) === 1100)
      const fits = () => { const m = document.querySelector('.pc-map').getBoundingClientRect(); const s = document.querySelector('.pc-map svg').getBoundingClientRect(); return Math.abs(s.width - m.width) <= 2 && Math.abs(s.height - m.height) <= 2 && Math.round(m.width) === 1100 }
      await page.waitForFunction(fits, null, { timeout: 5000 }).catch(async () => {
        const got = await page.evaluate(() => { const m = document.querySelector('.pc-map').getBoundingClientRect(); const s = document.querySelector('.pc-map svg').getBoundingClientRect(); return `map ${Math.round(m.width)}x${Math.round(m.height)}, track layer ${Math.round(s.width)}x${Math.round(s.height)}` })
        assert.fail(`5 s after the resize to 1100x700: ${got}`)
      })
    })
  })

  // ── E-30 · the scan overlay gives the focus back ───────────────────────────
  /** The overlay answers its Cancel and Escape once the camera is running: its video has a frame. */
  const cameraReady = async (page) => {
    await page.getByRole('dialog').getByRole('button', { name: /^(Annuler|Cancel)/ }).waitFor()
    await page.waitForFunction(() => { const v = document.querySelector('[role=dialog] video'); return !!v && v.readyState >= 2 })
  }
  const scanner = (page) => page.locator('button:has-text("▥")').first()
  test('closing_the_scan_overlay_on_a_phone_puts_the_focus_in_the_composer_field', async () => {
    await session({ phone: true }, async (page) => {
      await open(page, '/', (p) => p.locator('.adestia-chat textarea').waitFor())
      await page.locator('.adestia-chat').getByRole('button', { name: /^(Plus|More)$/ }).click()
      await scanner(page).click()
      await cameraReady(page)
      await shot(page, 'scan-phone')
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').getByRole('button', { name: /^(Annuler|Cancel)/ }).waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
      assert.equal(await activeInside(page, '.adestia-chat'), true)
    })
  })
  test('cancel_button_of_the_scan_overlay_also_returns_the_focus_to_the_composer_on_a_phone', async () => {
    await session({ phone: true }, async (page) => {
      await open(page, '/', (p) => p.locator('.adestia-chat textarea').waitFor())
      await page.locator('.adestia-chat').getByRole('button', { name: /^(Plus|More)$/ }).click()
      await scanner(page).click()
      await cameraReady(page)
      await page.getByRole('dialog').getByRole('button', { name: /^(Annuler|Cancel)/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: /^(Annuler|Cancel)/ }).waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA')
    })
  })
  test('closing_the_scan_overlay_at_a_desk_returns_the_focus_to_the_scan_button', async () => {
    await session({}, async (page) => {
      await open(page, '/', (p) => p.locator('.adestia-chat textarea').waitFor())
      await scanner(page).click()
      await cameraReady(page)
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').getByRole('button', { name: /^(Annuler|Cancel)/ }).waitFor({ state: 'detached' })
      assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /▥/)
    })
  })

  // ── E-25 · counts ──────────────────────────────────────────────────────────
  test('piece_counts_read_one_piece_in_the_singular_and_five_pieces_in_the_plural', async () => {
    await session({}, async (page) => {
      await open(page, '/atelier/caisson', (p) => p.getByText('MEL19').first().waitFor())
      const text = await page.locator('main').innerText()
      assert.ok(text.includes(w.oneP), `no « ${w.oneP} » in:\n${text.slice(0, 600)}`)
      assert.ok(text.includes(w.manyP), `no « ${w.manyP} »`)
      assert.doesNotMatch(text, w.badOne)
      await shot(page, 'atelier-counts')
    })
  })

  // ── E-31 · the content block writes its date in the instance's language ────
  test('content_block_dates_follow_the_instance_language_and_a_non_date_is_left_as_written', async () => {
    await session({}, async (page) => {
      await open(page, '/page/ensemble/dates.md', (p) => p.getByText('Bloc du quatorze mars.').waitFor())
      const text = await page.locator('main').innerText()
      assert.ok(text.includes(w.march), `no « ${w.march} » in:\n${text}`)
      assert.ok(text.includes(w.dec), `no « ${w.dec} »`)
      assert.ok(text.includes('bientot'), 'the author value is not written as it is')
      assert.ok(!text.includes('2026-03-14'), 'the ISO date is still written')
      await shot(page, 'content-dates')
    })
  })

  // ── E-31 · amber means one thing; a late item is not amber ─────────────────
  for (const dark of [false, true]) test(`amber_is_only_the_owners_status_and_a_late_milestone_is_dashed_muted_and_named_late, ${dark ? 'dark' : 'light'}`, async () => {
    await session({ dark }, async (page) => {
      await open(page, '/page/renovation/INDEX.md', (p) => p.locator('[title*="· ' + w.late + '"]').first().waitFor())
      await shot(page, `timeline-${dark ? 'dark' : 'light'}`)
      const r = await page.evaluate(() => {
        const rgb = (value) => { const probe = document.createElement('i'); probe.style.color = value; document.body.append(probe); const out = getComputedStyle(probe).color; probe.remove(); return out }
        const amberDot = document.querySelector('main [title="Amber"]')
        const amber = amberDot ? getComputedStyle(amberDot).backgroundColor : null
        const row = amberDot?.closest('button, li, div[role], tr') ?? amberDot?.parentElement
        const late = [...document.querySelectorAll('main [title]')].find((e) => /· (late|en retard)$/.test(e.getAttribute('title')))
        const lateStyle = late ? getComputedStyle(late) : null
        const stray = []
        for (const e of document.querySelectorAll('main *')) {
          if (e === amberDot || row?.contains(e)) continue
          const s = getComputedStyle(e)
          const colours = [s.color, s.backgroundColor, s.borderTopStyle !== 'none' && s.borderTopColor, s.borderLeftStyle !== 'none' && s.borderLeftColor, s.outlineStyle !== 'none' && s.outlineColor]
          if (amber && colours.includes(amber)) stray.push(`${e.tagName}.${String(e.className).slice(0, 40)}`)
        }
        return {
          amber, stray, lateTitle: late?.getAttribute('title'), lateStyle: lateStyle?.borderLeftStyle, lateColour: lateStyle?.borderLeftColor,
          muted: rgb('var(--text-muted)'), accent: rgb('var(--accent)'),
        }
      })
      assert.ok(r.amber, 'no Amber status is drawn for the owner assessment page')
      // a skin whose accent colour is the very amber (skippy) cannot tell the two apart by colour: no verdict there
      if (r.accent !== r.amber) assert.deepEqual(r.stray, [], `something else is drawn in the Amber colour ${r.amber}`)
      assert.ok(r.lateTitle.endsWith(`· ${w.late}`), r.lateTitle)
      assert.equal(r.lateStyle, 'dashed')
      assert.equal(r.lateColour, r.muted, 'the dashed outline is not the muted text colour')
      assert.notEqual(r.lateColour, r.amber)
      // the word is the milestone's accessible name too, on a phone where nothing hovers
      assert.ok(await page.getByRole('button', { name: new RegExp(w.late) }).count() + await page.getByLabel(new RegExp(w.late)).count() >= 1, `no accessible name carries « ${w.late} »:\n${await page.locator('main').ariaSnapshot()}`)
    })
  })

  // ── E-23 / E-27 · the sentences the plugins compose speak the instance's language ──
  test('planif_composed_phrases_are_in_the_instance_language', async () => {
    await session({}, async (page) => {
      await open(page, '/planif', (p) => p.getByText('Mission : réserver le vol').waitFor())
      const text = await page.locator('main').innerText()
      await shot(page, 'planif')
      if (locale === 'fr') {
        for (const english of ['clock off', 'nothing will run', 'until 2026-12-01', 'suspended', 'Ask to', 'next ', 'last ', 'Scheduled turns']) assert.ok(!text.includes(english), `English « ${english} » under fr:\n${text}`)
        assert.match(text, /2026-12-01/)
      } else {
        for (const english of ['clock off — nothing will run', 'until 2026-12-01', 'suspended', 'Ask to suspend']) assert.ok(text.includes(english), `en lost « ${english} »`)
      }
    })
  })
  test('listening_post_composed_phrases_are_in_the_instance_language', async () => {
    await session({}, async (page) => {
      await open(page, '/listening-post', (p) => p.locator('main').getByText(/Underscore_/).first().waitFor())
      const text = await page.locator('main').innerText()
      await shot(page, 'listening-post')
      if (locale === 'fr') for (const english of [/\bago\b/, /\bsilent\b/, /\bfrom\b/, /in your feeds/i, /\bDismiss\b/, /\bExtract\b/, /\bwatch\b/i]) assert.doesNotMatch(text, english, `English under fr:\n${text}`)
    })
  })

  // ── the plugins' chrome draws no emoji of its own (AD-24 d) ────────────────
  test('chrome_companions_are_icons_or_words_never_the_emoji_the_charter_removes', async () => {
    // Docs: page links, todo notes and attachments, warnings, suggestion counts and the walking-mode button
    // use the sprite or their word (charte § 2, ecrans § plugins). Content marks (an `ico`, trip item types) stay.
    const BANNED = /[📄📝⚠🖐📎🗃🥾💡☑]/u
    await session({}, async (page) => {
      const leaks = []
      for (const route of ['/todo', '/journal', '/journal/atelier', '/voyages', '/voyages/corse', '/voyages/porto', '/listening-post', '/page/balades/val-sans-retour.md', '/atelier/caisson']) {
        await page.goto(`${inst.url}/#${route}`, { waitUntil: 'domcontentloaded' })
        await page.locator('.adestia-shell').waitFor()
        await page.locator('main').getByRole('navigation').first().waitFor()
        await page.waitForTimeout(1200)
        const found = await page.evaluate(() => [...document.querySelectorAll('main *')].flatMap((e) => [e.children.length === 0 ? e.textContent : '', e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? '']).filter(Boolean))
        for (const line of found) if (BANNED.test(line)) leaks.push(`${route}: ${line.trim().slice(0, 60)}`)
      }
      assert.deepEqual([...new Set(leaks)], [], 'emoji drawn by a plugin as chrome')
    })
  })

  test('walking_follow_and_trip_hint_carry_no_emoji', async () => {
    await session({}, async (page) => {
      await open(page, '/page/balades/val-sans-retour.md', (p) => p.getByRole('button', { name: w.walk }).waitFor())
      assert.ok(!PICTO.test(await page.getByRole('button', { name: w.walk }).innerText()), 'the walking-mode button draws an emoji')
      await page.getByRole('button', { name: w.walk }).click()
      await page.getByRole('button', { name: w.leaveWalk }).waitFor()
      const names = await page.evaluate(() => [...document.querySelectorAll('.pc-map ~ * button, .pc-map button, button')].filter((b) => b.offsetParent).map((b) => b.innerText + ' ' + (b.getAttribute('aria-label') ?? '')))
      assert.deepEqual(names.filter((n) => PICTO.test(n)), [], 'a walking-mode control draws an emoji')
    })
    await session({}, async (page) => {
      await open(page, '/voyages/corse', (p) => p.getByText('Chez Anna', { exact: true }).first().waitFor())
      await page.locator('main').getByText('Chez Anna', { exact: true }).first().click()
      const hint = await page.getByRole('dialog').locator('.vhint').innerText()
      assert.ok(hint.length > 0 && !PICTO.test(hint), `trip hint « ${hint} »`)
    })
  })
})
