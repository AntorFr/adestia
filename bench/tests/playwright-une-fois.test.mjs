/** AD-26 / criterion "loadPlaywright is defined once": every bench script that drives a browser gets Playwright from bench/lib/playwright.mjs. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const scenarios = execFileSync('git', ['ls-files', 'bench/scenarios/*.mjs'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const read = (path) => readFileSync(join(root, path), 'utf8')
const five = ['chat-compositeur', 'chat-correctifs', 'chat-permission', 'chat-rail', 'scan-focus'].map((name) => `bench/scenarios/${name}.mjs`)

test('the five scenarios that kept a private Playwright finder import loadPlaywright instead', () => {
  // red if one of them goes back to its own playwright() copy
  for (const path of five) {
    assert.ok(scenarios.includes(path), `${path} is tracked`)
    assert.match(read(path), /import\s*\{[^}]*\bloadPlaywright\b[^}]*\}\s*from\s*'\.\.\/lib\/playwright\.mjs'/, path)
  }
})

test('no scenario declares a function named playwright', () => {
  // red if a scenario declares its own playwright() beside the shared loader
  const own = scenarios.filter((path) => /(?:function\s+playwright\s*\(|(?:const|let|var)\s+playwright\s*=)/.test(read(path)))
  assert.deepEqual(own, [])
})

test('every scenario that launches a browser takes Playwright from the shared loader', () => {
  // red if a scenario drives chromium through anything but loadPlaywright()
  const rogue = scenarios.filter((path) => /\.chromium\b/.test(read(path)) && !/\bloadPlaywright\(\)/.test(read(path)))
  assert.deepEqual(rogue, [])
})
