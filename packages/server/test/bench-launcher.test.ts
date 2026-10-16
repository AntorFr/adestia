import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

const launch = fileURLToPath(new URL('../../../bench/launch.mjs', import.meta.url))
const built = existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url)))
// A private TMPDIR for the launchers this file starts: other test files start
// launchers of their own in parallel, and counting the shared tmpdir would
// count their directories.
const sandbox = await tmpDir('bench-launcher-test-')
const leftovers = () => readdirSync(sandbox).filter((n) => n.startsWith('adestia-launch-'))

const run = (args: string[], env: Record<string, string | undefined> = {}) =>
  spawnSync(process.execPath, [launch, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: sandbox, CLAUDE_CODE_OAUTH_TOKEN: undefined, ...env },
  })

describe('bench launcher refusals', () => {
  it('refuses --engine claude without the token, naming it', () => {
    const r = run(['--engine', 'claude'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('CLAUDE_CODE_OAUTH_TOKEN')
  })
  it('refuses an empty token', () => {
    expect(run(['--engine', 'claude'], { CLAUDE_CODE_OAUTH_TOKEN: '' }).status).toBe(1)
  })
  it.each([
    [['--engine', 'gpt']],
    [['--locale', 'de']],
    [['--port', '99999']],
    [['--port', '-1']],
    [['--bogus', 'x']],
    [['--seed']],
    [['--seed', '../x']],
  ])('rejects %j with a non-zero exit', (args) => {
    expect(run(args).status).not.toBe(0)
  })
  it('rejects an unknown seed without leaving a directory', () => {
    const before = leftovers().length
    expect(run(['--seed', 'nope']).status).not.toBe(0)
    expect(leftovers().length).toBe(before)
  })
})

describe.skipIf(!built)('bench launcher, fake engine', () => {
  it('answers by script, identically twice, and removes its data on SIGTERM', async () => {
    const child = spawn(process.execPath, [launch, '--engine', 'fake'], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TMPDIR: sandbox } })
    const exited = new Promise<number | null>((done) => child.once('exit', done))
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = ''
        child.stdout!.on('data', (d) => {
          out += d
          const m = /listening on (\S+)/.exec(out)
          if (m) resolve(m[1]!)
        })
        child.once('exit', () => reject(new Error('exited early')))
      })
      expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: 'ok' })
      const ask = async (prompt: string) =>
        (
          await fetch(`${url}/api/turn`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt }),
          })
        ).text()
      const a = await ask('ping')
      expect(a).toContain('"text":"pong"')
      expect(await ask('ping')).toBe(a)
      expect(await ask('Bonjour')).toContain('"text":"Bonjour"')
      expect(leftovers().length).toBeGreaterThan(0)
    } finally {
      child.kill('SIGTERM')
    }
    expect(await exited).toBe(0)
    expect(leftovers()).toEqual([])
  }, 60_000)

  it('boots the plugins seed with the ten bundled plugins loaded and no plugin problem', async () => {
    const child = spawn(process.execPath, [launch, '--engine', 'fake', '--seed', 'plugins'], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TMPDIR: sandbox } })
    const exited = new Promise<number | null>((done) => child.once('exit', done))
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = ''
        child.stdout!.on('data', (d) => {
          out += d
          const m = /listening on (\S+)/.exec(out)
          if (m) resolve(m[1]!)
        })
        child.once('exit', () => reject(new Error('exited early')))
      })
      expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: 'ok' })
      const instance = (await (await fetch(`${url}/api/instance`)).json()) as { plugins: { id: string }[]; pluginProblems: unknown[] }
      const ids = instance.plugins.map((p) => p.id)
      for (const id of ['todo', 'planif', 'journal', 'atelier', 'voyages', 'listening-post', 'scan', 'parcours', 'meals', 'project-management'])
        expect(ids).toContain(id)
      expect(instance.pluginProblems).toEqual([])
    } finally {
      child.kill('SIGTERM')
    }
    expect(await exited).toBe(0)
  }, 60_000)
})

describe.skipIf(!built)('bench launcher, stored credential', () => {
  afterEach(cleanTmp)
  // Panne visée : le pilote Claude préfère la crédential rangée à la variable
  // d'environnement ; un jeton factice rangé par un semis masque celui du pod
  // (401). Le lanceur doit donc le retirer en --engine claude, et le laisser
  // en --engine fake (les écrans qui montrent la crédential).
  const launched = async (args: string[], env: Record<string, string>) => {
    const parent = await tmpDir('bench-cred-')
    const data = join(parent, 'inst')
    const stored = join(data, 'data', 'secrets', 'claude-code.token')
    mkdirSync(join(data, 'data', 'secrets'), { recursive: true })
    writeFileSync(stored, 'placeholder-token')
    const child = spawn(process.execPath, [launch, ...args, '--data', data], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...env },
    })
    const exited = new Promise<number | null>((done) => child.once('exit', done))
    try {
      await new Promise<void>((resolve, reject) => {
        let out = ''
        child.stdout!.on('data', (d) => {
          out += d
          if (/listening on \S+/.test(out)) resolve()
        })
        child.once('exit', () => reject(new Error('exited early')))
      })
      return existsSync(stored)
    } finally {
      child.kill('SIGTERM')
      await exited
    }
  }
  it('drops a stored credential in claude mode, so the environment token is used', async () => {
    expect(await launched(['--engine', 'claude'], { CLAUDE_CODE_OAUTH_TOKEN: 'sk-test-not-real' })).toBe(false)
  }, 60_000)
  it('keeps a stored credential in fake mode', async () => {
    expect(await launched(['--engine', 'fake'], {})).toBe(true)
  }, 60_000)
})
