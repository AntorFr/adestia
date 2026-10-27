/**
 * Shell habillage, looked at: Nestor's arrow, Skippy's console band, E-14's
 * switch row and E-20, in en and fr, light and dark, 1440 and 360 px.
 *
 *   node bench/scenarios/shell-habillage.mjs <label> [--out <dir>]
 *
 * Host run (no docker): it starts `bench/launch.mjs` itself, once per skin and
 * language, so the instance wears the skin under test. `<label>` (`avant` /
 * `apres`) prefixes the pictures. Measures what it can instead of trusting the
 * eye: the console band height at 360 px, the `top` of E-14's switch against
 * its title. Exits 1 if a measure fails.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { argv, execPath, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const launcher = resolve(here, '..', 'launch.mjs')
const label = argv[2] ?? 'apres'
const out = resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : join(here, '..', 'shots-habillage'))
mkdirSync(out, { recursive: true })

const { chromium } = (() => {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  for (const n of ['playwright-core', 'playwright']) {
    try { return createRequire(`${root}/`)(n) } catch { /* next */ }
  }
  throw new Error('playwright not found')
})()

const boot = (args) =>
  new Promise((ok, ko) => {
    const child = spawn(execPath, [launcher, '--engine', 'fake', ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
    let buf = ''
    child.stdout.on('data', (d) => {
      buf += d
      const m = /listening on (\S+)/.exec(buf)
      if (m) ok({ url: m[1], stop: () => child.kill('SIGTERM') })
    })
    child.on('exit', (c) => ko(new Error(`launcher exited ${c}`)))
  })

const SIZES = { desk: [1440, 900], phone: [360, 740] }
const failures = []
const browser = await chromium.launch()

const visit = async (url, route, { theme, size, name, measure }) => {
  const [width, height] = SIZES[size]
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
  const page = await ctx.newPage()
  await page.goto(`${url}/#${route}`)
  await page.waitForTimeout(1200)
  // The phone shows one of two screens: the pictures are of the canvas.
  const shell = page.locator('.adestia-shell')
  if (width < 700 && (await shell.getAttribute('data-screen')) !== 'canvas') {
    await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
    await page.waitForSelector('.adestia-shell[data-screen="canvas"]')
    await page.waitForTimeout(400)
  }
  const result = measure ? await measure(page, size) : undefined
  await page.screenshot({ path: join(out, `${label}-${name}-${theme}-${size}.png`) })
  await ctx.close()
  return result
}

const measureNestor = (page) =>
  page.evaluate(() => {
    const i = document.querySelector('.nst-invite i')
    return i ? { svg: !!i.querySelector('svg'), text: i.textContent.trim() } : null
  })

const measureSkippy = (page, size) =>
  page.evaluate(() => {
    const b = document.querySelector('.console')
    return b ? { height: Math.round(b.getBoundingClientRect().height), scrollW: b.scrollWidth, clientW: b.clientWidth } : null
  })

const measureSwitch = (page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('.adestia-config__field')]
    const row = rows.find((r) => r.querySelector('[role="switch"]'))
    if (!row) return null
    const sw = row.querySelector('[role="switch"]').getBoundingClientRect()
    const title = row.querySelector('.adestia-config__label').getBoundingClientRect()
    const mid = (r) => r.top + r.height / 2
    return { switchTop: Math.round(sw.top), titleTop: Math.round(title.top), dMid: Math.round(mid(sw) - mid(title)), titleH: Math.round(title.height) }
  })

for (const locale of ['en', 'fr']) {
  for (const skin of ['alfred', 'dobby', 'nestor', 'skippy']) {
    const specs = [
      { seed: 'config-writable', route: '/settings/config', name: `E-14-${skin}-${locale}`, measure: measureSwitch, kind: 'switch' },
      { seed: 'plugins', route: '/bench-noview', name: `E-20-${skin}-${locale}` },
    ]
    if (skin === 'nestor') specs.push({ seed: 'base', route: '/', name: `nestor-${locale}`, measure: measureNestor, kind: 'nestor' })
    if (skin === 'skippy') specs.push({ seed: 'base', route: '/', name: `skippy-${locale}`, measure: measureSkippy, kind: 'skippy' })
    for (const spec of specs) {
      const inst = await boot(['--skin', skin, '--locale', locale, '--seed', spec.seed])
      try {
        for (const theme of ['light', 'dark']) {
          for (const size of ['desk', 'phone']) {
            const m = await visit(inst.url, spec.route, { theme, size, name: spec.name, measure: spec.measure })
            if (m) console.log(label, spec.name, theme, size, JSON.stringify(m))
            if (spec.kind === 'skippy' && size === 'phone' && (!m || m.height > 40 || m.scrollW > m.clientW)) failures.push(`${spec.name} ${theme}: band ${JSON.stringify(m)}`)
            if (spec.kind === 'switch' && size === 'phone' && (!m || Math.abs(m.switchTop - m.titleTop) > 8)) failures.push(`${spec.name} ${theme}: switch ${JSON.stringify(m)}`)
            if (spec.kind === 'nestor' && (!m || !m.svg || m.text)) failures.push(`${spec.name} ${theme} ${size}: arrow ${JSON.stringify(m)}`)
          }
        }
      } finally {
        inst.stop()
      }
    }
  }
}
await browser.close()
if (failures.length) { console.log('FAIL\n' + failures.join('\n')); exit(1) }
console.log('ok')
