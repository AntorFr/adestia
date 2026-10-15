import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const launch = fileURLToPath(new URL('../../../bench/launch.mjs', import.meta.url))
const built = existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url)))
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('adestia-launch-'))

const run = (args: string[], env: Record<string, string | undefined> = {}) =>
  spawnSync(process.execPath, [launch, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined, ...env },
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
    const child = spawn(process.execPath, [launch, '--engine', 'fake'], { stdio: ['ignore', 'pipe', 'ignore'] })
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
})
