import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ScriptedDriver, RESULT, driverWith, scriptedDriver } from './support/driver.js'
import { git, gitRepo } from './support/git.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const exists = (p: string) => stat(p).then(() => true, () => false)

describe('tmp support', () => {
  it('cleanTmp removes every directory tmpDir made, with its content', async () => {
    const a = await tmpDir('adestia-support-a-')
    const b = await tmpDir('adestia-support-b-')
    await gitRepo(join(a, 'nested'), { 'x.txt': 'x' })
    expect(await exists(a)).toBe(true)
    await cleanTmp()
    expect(await exists(a)).toBe(false)
    expect(await exists(b)).toBe(false)
  })

  it('cleanTmp is harmless when nothing is left, or the directory is already gone', async () => {
    await cleanTmp()
    const a = await tmpDir('adestia-support-c-')
    await cleanTmp()
    await expect(cleanTmp()).resolves.toBeUndefined()
    expect(await exists(a)).toBe(false)
  })

  it('does not remove a directory made after the last cleanTmp twice over', async () => {
    const a = await tmpDir('adestia-support-d-')
    await cleanTmp()
    const b = await tmpDir('adestia-support-e-')
    expect(await exists(b)).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe('git support', () => {
  it('gitRepo commits the files on main under the fixed author and returns the HEAD sha', async () => {
    const dir = await tmpDir('adestia-support-git-')
    const sha = await gitRepo(join(dir, 'repo'), { 'a.md': 'A', 'deep/b.md': 'B' })
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(await readFile(join(dir, 'repo', 'deep', 'b.md'), 'utf8')).toBe('B')
    const { execFile } = await import('node:child_process')
    const out = await new Promise<string>((resolve, reject) =>
      execFile('git', ['log', '-1', '--format=%an <%ae>|%cn|%D'], { cwd: join(dir, 'repo') }, (e, stdout) =>
        e ? reject(e) : resolve(stdout.trim()),
      ),
    )
    expect(out).toBe('T <t@example.org>|T|HEAD -> main')
  })

  it('git rejects when the command fails', async () => {
    const dir = await tmpDir('adestia-support-git-')
    await expect(git(dir, 'rev-parse', 'HEAD')).rejects.toThrow()
  })
})

describe('driver support', () => {
  it('ScriptedDriver replays its script and records the request', async () => {
    const driver = new ScriptedDriver([RESULT])
    const events: unknown[] = []
    for await (const e of driver.runTurn({ prompt: 'p' } as never)) events.push(e)
    expect(events).toEqual([{ type: 'result', sessionId: 's1', stopped: false }])
    expect(driver.requests.map((r) => r.prompt)).toEqual(['p'])
    await driver.running
  })

  it('a held ScriptedDriver turn ends as stopped when its signal aborts', async () => {
    const driver = new ScriptedDriver([RESULT], { hold: new Promise<void>(() => {}) })
    const ctl = new AbortController()
    const events: unknown[] = []
    const run = (async () => {
      for await (const e of driver.runTurn({ prompt: 'held', signal: ctl.signal } as never)) events.push(e)
    })()
    await driver.running
    ctl.abort()
    await run
    expect(events).toEqual([{ type: 'result', sessionId: 's1', stopped: true }])
    expect(driver.stopped).toEqual(['held'])
  })

  it('ScriptedDriver reports its capabilities and instruction paths when given', async () => {
    const d = new ScriptedDriver([], { capabilities: [], instructionPaths: ['AGENTS.md'] })
    expect((await d.describe()).capabilities).toEqual([])
    expect(d.instructionPaths?.()).toEqual(['AGENTS.md'])
    expect(new ScriptedDriver().instructionPaths).toBeUndefined()
  })

  it('driverWith is quiet by default and lets the test override', async () => {
    const quiet = driverWith()
    expect((await quiet.describe()).capabilities).toEqual([])
    const events: unknown[] = []
    for await (const e of quiet.runTurn({} as never)) events.push(e)
    expect(events).toEqual([])
    const loud = driverWith({ env: () => Promise.resolve({ A: '1' }) })
    expect(await loud.env()).toEqual({ A: '1' })
  })

  it('scriptedDriver passes the 1-based call number and records requests', async () => {
    const d = scriptedDriver((_r, call) => [{ type: 'result', sessionId: `s${call}`, stopped: false }])
    const seen: unknown[] = []
    for (const p of ['one', 'two'])
      for await (const e of d.runTurn({ prompt: p } as never)) seen.push(e)
    expect(seen).toEqual([
      { type: 'result', sessionId: 's1', stopped: false },
      { type: 'result', sessionId: 's2', stopped: false },
    ])
    expect(d.requests.map((r) => r.prompt)).toEqual(['one', 'two'])
  })
})
