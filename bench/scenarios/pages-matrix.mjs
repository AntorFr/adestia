#!/usr/bin/env node
/** Four liveries × two languages × two themes × desk/phone.
 * node bench/scenarios/pages-matrix.mjs [scenario-module]
 * BENCH_OUT names the screenshot directory. BENCH_URL reuses a running instance
 * (its skin and locale must match BENCH_SKIN / BENCH_LOCALE).
 * Further page scenarios use the same { page, url, shot, phone, locale } contract.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')
const scenario = (await import(pathToFileURL(resolve(process.argv[2] ?? 'bench/scenarios/pages-states.mjs')))).default
const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-pages')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
function launch(skin, locale) {
  const child = spawn(process.execPath, ['bench/launch.mjs', '--engine', 'fake', '--seed', 'pages', '--skin', skin, '--locale', locale], { stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''
  child.stderr.on('data', (chunk) => { errors += chunk })
  const url = new Promise((resolveUrl, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = /listening on (\S+)/.exec(output)
      if (match) resolveUrl(match[1])
    })
    child.on('error', reject)
    child.once('exit', (code) => reject(new Error(`launch exited ${code}: ${errors}`)))
  })
  return { url, stop: () => new Promise((done) => { if (child.exitCode !== null) return done(); child.once('exit', done); child.kill('SIGTERM') }) }
}
try {
  for (const skin of (process.env.BENCH_URL ? [process.env.BENCH_SKIN ?? 'alfred'] : ['alfred', 'nestor', 'dobby', 'skippy'])) {
    for (const locale of (process.env.BENCH_URL ? [process.env.BENCH_LOCALE ?? 'en'] : ['en', 'fr'])) {
      const instance = process.env.BENCH_URL ? { url: process.env.BENCH_URL, stop: async () => {} } : launch(skin, locale)
      try {
        const url = await instance.url
        for (const theme of ['light', 'dark']) for (const phone of [false, true]) {
          const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, colorScheme: theme })
          try {
            const page = await context.newPage()
            await page.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
            const prefix = `${skin}-${locale}-${theme}-${phone ? 'phone' : 'desk'}`
            const shot = async (name) => { await page.screenshot({ animations: 'disabled', path: resolve(out, `${prefix}-${name}.png`) }); console.log(`${prefix}-${name}`) }
            await scenario({ page, url, shot, phone, locale })
          } finally { await context.close() }
        }
      } finally { await instance.stop() }
    }
  }
} finally { await browser.close() }
