/**
 * E-16, AD-19/20/23: real HTTP 429, uploaded/sent file, native model picker,
 * and a nominal ping/pong through the scripted driver (not a real Claude turn).
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-correctifs.mjs --out bench/shots-correctifs-chat
 * Only E-16 is captured; no other screen changes in this tranche.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'chat-correctifs'
const words = {
  en: { new: 'New conversation', model: 'Model', auto: 'Auto', refusal: 'Turn limit reached (1 at a time) — try again in a moment.' },
  fr: { new: 'Nouvelle conversation', model: 'Modèle', auto: 'Auto', refusal: 'Limite de tours atteinte (1 à la fois) — réessayez dans un instant.' },
}
const file = { name: 'menu-samedi.txt', mimeType: 'text/plain', buffer: Buffer.from('Soup and pie.\n') }

function playwright() {
  for (const root of ['/usr/lib/node_modules', execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()]) {
    for (const name of ['playwright', 'playwright-core']) {
      try { return createRequire(`${root}/`)(name) } catch { /* next environment root */ }
    }
  }
  throw new Error('Playwright must come from the environment')
}

// Compose all ancestor backgrounds, including translucent skin fills.
async function contrast(locator) {
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
  assert(pair.ratio >= 4.5, `Text contrast below AA: ${JSON.stringify(pair)}`)
  return pair
}

export default async function scenario() {
  const base = process.env.BENCH_URL
  assert(base, 'BENCH_URL is required (run through chat-matrix.mjs)')
  const locale = process.env.BENCH_LOCALE ?? 'en'
  const w = words[locale]
  assert(w, `Unsupported locale: ${locale}`)
  const out = process.env.BENCH_OUT ?? 'bench/shots-correctifs-chat'
  await mkdir(out, { recursive: true })
  const instance = await (await fetch(`${base}/api/instance`)).json()
  const skin = instance.skin.id
  const brand = { alfred: 'Alfred', nestor: 'Nestor', dobby: 'Dobby', skippy: 'SKIPPY' }[skin]
  assert(brand, `Expected one of the four skins, got ${skin}`)
  const nativePopup = process.env.BENCH_NATIVE_PICKER === '1'
  const browser = await playwright().chromium.launch({ headless: !nativePopup, args: ['--no-sandbox', '--window-position=0,0'] })
  const report = { engine: 'fake', realClaude: false, screen: 'E-16', skin, locale, variants: [] }
  const post = async (path, body) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert(response.ok, `${path}: ${response.status}`)
    return response
  }
  try {
    for (const theme of ['light', 'dark']) for (const [format, width, height] of [['desk', 1440, 900], ['phone', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, locale, colorScheme: theme, ...(format === 'phone' ? { hasTouch: true, isMobile: true } : {}) })
      let blocker
      try {
        blocker = (await (await post('/api/conversations', {})).json()).id
        const running = await post('/api/turn', { conversationId: blocker, prompt: 'en cours' })
        const reader = running.body.getReader()
        await reader.read()
        await reader.cancel()
        const page = await context.newPage()
        const dressed = () => page.waitForFunction(({ skin, brand, theme }) =>
          document.documentElement.dataset.skin === skin &&
          (!document.documentElement.dataset.theme || document.documentElement.dataset.theme === theme) &&
          document.querySelector('.adestia-brandname')?.textContent === brand &&
          [...document.querySelectorAll('link[data-skin]')].some((link) => link.sheet),
        { skin, brand, theme })
        await page.addInitScript((theme) => localStorage.setItem('adestia.theme', theme), theme)
        await page.goto(base, { waitUntil: 'domcontentloaded' })
        const chat = page.locator('.adestia-chat')
        await chat.waitFor()
        await dressed()
        await chat.getByRole('button', { name: w.new, exact: true }).click()
        const upload = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/upload' && r.request().method() === 'POST')
        await chat.locator('input[type=file]').setInputFiles(file)
        assert.equal((await upload).status(), 200)
        await chat.locator('.adestia-attachments__item', { hasText: file.name }).waitFor()
        const field = chat.locator('textarea')
        await field.fill('Please read this file.')
        const refused = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn' && r.request().method() === 'POST')
        const reread = page.waitForResponse((r) => /^\/api\/conversations\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET')
        await field.press('Enter')
        assert.equal((await refused).status(), 429)
        await reread
        const line = chat.getByRole('alert').filter({ hasText: w.refusal })
        await line.waitFor()
        const bubble = chat.locator('.adestia-bubble--user', { hasText: 'Please read this file.' })
        await bubble.locator('.adestia-bubble__attachments', { hasText: file.name }).waitFor()
        assert.equal(await bubble.locator('use[href="#adestia-i-paperclip"]').count(), 1)
        assert(!(await bubble.innerText()).includes('📎'), 'sent file uses the sprite, not a text emoji')
        assert.equal(await chat.locator('.adestia-composer__stop').count(), 0)
        await chat.locator('.adestia-composer__send').waitFor()
        const colours = { refusal: await contrast(line), attachment: await contrast(bubble.locator('.adestia-bubble__attachments')) }
        const shots = []
        const shoot = async (state, native = false) => {
          const name = `${theme}-${format}-${state}.png`
          await dressed()
          await page.evaluate(() => document.fonts.ready)
          if (native) execFileSync('python3', ['bench/native-picker-shot.py', join(out, name)])
          else await chat.screenshot({ path: join(out, name) })
          shots.push(name)
          console.log(`shot ${locale}/${name}`)
        }
        await shoot('refusal-attachment')

        const picker = chat.getByRole('combobox', { name: w.model, exact: true })
        assert((await picker.getAttribute('class')).includes('adestia-select'))
        assert.equal(await picker.locator('option[value=""]').innerText(), w.auto)
        await picker.click()
        assert(await picker.evaluate((el) => el === document.activeElement), 'native picker has focus')
        await page.waitForFunction(() => document.querySelector('.adestia-model').matches(':open'))
        // Native popups live outside Page.captureScreenshot. Xvfb lets us see the real list.
        if (nativePopup) await page.waitForTimeout(150)
        await shoot('model-open', nativePopup)
        await picker.press('Escape')
        await picker.selectOption('bench-long')
        assert.equal(await picker.inputValue(), 'bench-long')

        await post('/api/turn/stop', { conversation: blocker })
        blocker = undefined
        await field.fill('ping')
        await field.press('Enter')
        await chat.locator('.adestia-bubble--agent', { hasText: /^pong$/ }).waitFor()
        await chat.locator('.adestia-composer__send').waitFor()
        assert.equal(await line.count(), 0, 'the next send clears the refusal')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await chat.locator('.adestia-bubble--agent', { hasText: /^pong$/ }).waitFor()
        await shoot('nominal-stored')
        report.variants.push({ theme, format, viewport: { width, height }, refusalStatus: 429, refusal: w.refusal, sentAttachment: file.name, sprite: 'paperclip', nativePickerOpened: true, pickerCapture: nativePopup ? 'X11 native popup, top-left 520×360' : 'page surface only; native popup omitted by Chromium', selectedModel: 'bench-long', nominal: 'ping → pong, retained after reload (fake engine)', colours, shots })
      } finally {
        if (blocker) await post('/api/turn/stop', { conversation: blocker })
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await writeFile(join(out, 'correctifs-report.json'), JSON.stringify(report, null, 2) + '\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
