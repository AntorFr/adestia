#!/usr/bin/env node
/** Reusable host runner: skin × locale, with each scenario owning themes and widths.
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-rail.mjs [--skin alfred] [--locale en] [--out bench/shots-chat]
 * A scenario reads BENCH_URL and BENCH_OUT, default-exports async (), and may
 * export `seed` (default: base). No product configuration or bench.mjs extension.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const scenario = resolve(args.shift() ?? 'bench/scenarios/chat-rail.mjs')
const options = { out: 'bench/shots-chat' }
while (args.length) {
  const flag = args.shift()
  if (!['--skin', '--locale', '--out'].includes(flag) || !args.length) throw new Error(`Unknown or incomplete option: ${flag}`)
  options[flag.slice(2)] = args.shift()
}
const skins = options.skin ? [options.skin] : ['alfred', 'nestor', 'dobby', 'skippy']
const locales = options.locale ? [options.locale] : ['en', 'fr']
if (skins.some((skin) => !['alfred', 'nestor', 'dobby', 'skippy'].includes(skin))) throw new Error('Unknown skin')
if (locales.some((locale) => !['en', 'fr'].includes(locale))) throw new Error('Unknown locale')
const { seed = 'base' } = await import(pathToFileURL(scenario))
let instance
let runner
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise((done) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
    child.once('exit', () => { clearTimeout(timer); done() })
  })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await stop(runner)
  await stop(instance)
  process.exit(1)
})
for (const skin of skins) for (const locale of locales) {
  try {
    const out = resolve(join(options.out, skin, locale))
    await mkdir(out, { recursive: true })
    instance = spawn(process.execPath, ['bench/launch.mjs', '--seed', seed, '--skin', skin, '--locale', locale], { stdio: ['ignore', 'pipe', 'inherit'] })
    const url = await new Promise((done, reject) => {
      let log = ''
      const timer = setTimeout(() => reject(new Error('Launcher did not become ready within 60 seconds')), 60000)
      instance.stdout.on('data', (chunk) => {
        log += chunk
        const match = /listening on (http:\/\/[^\s]+)/.exec(log)
        if (match) { clearTimeout(timer); done(match[1]) }
      })
      instance.once('error', (error) => { clearTimeout(timer); reject(error) })
      instance.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Launcher exited: ${code}`)) })
    })
    console.log(`Capturing ${skin}/${locale} at ${url}`)
    runner = spawn(process.execPath, [scenario], { stdio: 'inherit', env: { ...process.env, BENCH_URL: url, BENCH_OUT: out, BENCH_LOCALE: locale } })
    await new Promise((done, reject) => {
      runner.once('error', reject)
      runner.once('exit', (code) => code === 0 ? done() : reject(new Error(`Scenario failed: ${skin}/${locale} (${code})`)))
    })
  } finally {
    await stop(runner)
    await stop(instance)
  }
}
