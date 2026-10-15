// Black-box tests of B-2 and B-3 (docs/parcours.md, P-15), written from the
// need and not from the implementation: a developer launches Adestia on the
// fake engine with one command and no docker, and captures every screen in
// light and dark, desk and phone, for a chosen skin. Everything here goes
// through the commands a developer types (`node bench/launch.mjs`,
// `node bench/sweep.mjs`) as child processes; the expected values are literals
// taken from the need (docs/parcours.md B-2, B-3; docs/ecrans.md E-1..E-31).
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const launch = fileURLToPath(new URL('../../../bench/launch.mjs', import.meta.url))
const sweep = fileURLToPath(new URL('../../../bench/sweep.mjs', import.meta.url))
const built =
  existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url))) &&
  existsSync(fileURLToPath(new URL('../../web/dist-web/index.html', import.meta.url)))
const globalRoot = (() => {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()
const hasPlaywright = globalRoot !== '' && existsSync(join(globalRoot, 'playwright'))

// A private TMPDIR: the launcher's throwaway directories land here, so the
// tests can say whether one was left behind without seeing other files' runs.
const sandbox = mkdtempSync(join(tmpdir(), 'bench-besoin-'))
const leftovers = () => readdirSync(sandbox).filter((n) => n.startsWith('adestia-launch-'))

const running = new Set<ChildProcess>()
afterAll(() => {
  for (const p of running) p.kill('SIGKILL')
})

interface Instance {
  url: string
  child: ChildProcess
  stop: () => Promise<number | null>
}

const start = async (args: string[], env: Record<string, string | undefined> = {}) => {
  const child = spawn(process.execPath, [launch, '--engine', 'fake', ...args], {
    env: { ...process.env, TMPDIR: sandbox, CLAUDE_CODE_OAUTH_TOKEN: undefined, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  running.add(child)
  let out = ''
  child.stdout!.on('data', (d: Buffer) => (out += d))
  child.stderr!.on('data', (d: Buffer) => (out += d))
  const exited = new Promise<number | null>((resolve) => child.on('exit', (c) => resolve(c)))
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "listening on" in 40s:\n${out}`)), 40_000)
    const tick = setInterval(() => {
      const m = /^listening on (http:\/\/\S+)$/m.exec(out)
      if (m) {
        clearInterval(tick)
        clearTimeout(timer)
        resolve(m[1]!)
      }
    }, 50)
    void exited.then((c) => {
      clearInterval(tick)
      clearTimeout(timer)
      reject(new Error(`launcher exited ${c} before listening:\n${out}`))
    })
  })
  const stop = async () => {
    child.kill('SIGTERM')
    return exited
  }
  return { url, child, stop } as Instance
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const turn = async (url: string, prompt: string) => {
  const conv = (await (await post(`${url}/api/conversations`, {})).json()) as { id: string }
  const res = await post(`${url}/api/turn`, { prompt, conversationId: conv.id })
  return { id: conv.id, status: res.status, body: await res.text() }
}

describe.skipIf(!built)('B-2 · launch on the fake engine, no docker', () => {
  it('answers ok on /api/health with a PATH that holds node and nothing else (no docker)', async () => {
    const inst = await start([], { PATH: dirname(process.execPath) })
    try {
      const res = await fetch(`${inst.url}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('answers the message "ping" with the scripted "pong", the same way twice', async () => {
    const inst = await start([])
    try {
      const a = await turn(inst.url, 'ping')
      const b = await turn(inst.url, 'ping')
      expect(a.status).toBe(200)
      expect(a.body).toContain('"text":"pong"')
      expect(a.body).toContain('event: result')
      expect(b.body).toBe(a.body)
      const stored = (await (await fetch(`${inst.url}/api/conversations/${a.id}`)).json()) as {
        messages: { role: string; text: string }[]
      }
      expect(stored.messages.map((m) => [m.role, m.text])).toEqual([
        ['user', 'ping'],
        ['agent', 'pong'],
      ])
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('echoes a message no script matches', async () => {
    const inst = await start([])
    try {
      const r = await turn(inst.url, 'zébulon 42')
      expect(r.body).toContain('"text":"zébulon 42"')
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('refuses a turn without a prompt rather than inventing an answer', async () => {
    const inst = await start([])
    try {
      const res = await post(`${inst.url}/api/turn`, {})
      expect(res.status).toBe(400)
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('listens on the port asked for', async () => {
    const port = await freePort()
    const inst = await start(['--port', String(port)])
    try {
      expect(inst.url).toBe(`http://127.0.0.1:${port}`)
      expect((await fetch(`http://127.0.0.1:${port}/api/health`)).status).toBe(200)
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('serves the chosen skin and locale', async () => {
    const inst = await start(['--skin', 'skippy', '--locale', 'fr'])
    try {
      const info = (await (await fetch(`${inst.url}/api/instance`)).json()) as {
        skin: { id: string }
        locale: string
      }
      expect(info.skin.id).toBe('skippy')
      expect(info.locale).toBe('fr')
    } finally {
      await inst.stop()
    }
  }, 60_000)

  it('removes its throwaway data on SIGTERM', async () => {
    const before = leftovers().length
    const inst = await start([])
    expect(leftovers().length).toBe(before + 1)
    const code = await inst.stop()
    expect(code).toBe(0)
    expect(leftovers().length).toBe(before)
  }, 60_000)

  it('keeps a data directory the developer names', async () => {
    const data = join(mkdtempSync(join(sandbox, 'named-')), 'mine')
    mkdirSync(data)
    const inst = await start(['--data', data])
    await inst.stop()
    expect(existsSync(data)).toBe(true)
    expect(readdirSync(data).length).toBeGreaterThan(0)
  }, 60_000)

  it('refuses the real engine without CLAUDE_CODE_OAUTH_TOKEN, naming it, and never listens', () => {
    const r = spawnSync(process.execPath, [launch, '--engine', 'claude'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: sandbox, CLAUDE_CODE_OAUTH_TOKEN: undefined },
      timeout: 20_000,
    })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(r.stdout).not.toContain('listening on')
  })

  it('refuses an unknown engine with a non-zero exit', () => {
    const r = spawnSync(process.execPath, [launch, '--engine', 'copilot'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: sandbox },
      timeout: 20_000,
    })
    expect(r.status).not.toBe(0)
    expect(r.stdout).not.toContain('listening on')
  })
})

// ── B-3 ────────────────────────────────────────────────────────────────────
const pngSize = (file: string) => {
  const b = readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

// Asynchronous on purpose: a blocking spawn for two minutes starves vitest's
// worker of its heartbeat and fails the run with an unrelated RPC timeout.
const runSweep = async (args: string[]) => {
  const out = mkdtempSync(join(sandbox, 'sweep-'))
  const child = spawn(process.execPath, [sweep, ...args, '--out', out], {
    env: { ...process.env, TMPDIR: sandbox, CLAUDE_CODE_OAUTH_TOKEN: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  running.add(child)
  let stdout = ''
  let stderr = ''
  child.stdout!.on('data', (d: Buffer) => (stdout += d))
  child.stderr!.on('data', (d: Buffer) => (stderr += d))
  const status = await new Promise<number | null>((resolve) => child.on('exit', (c) => resolve(c)))
  return { out, r: { status, stdout, stderr } }
}

describe.skipIf(!built || !hasPlaywright)('B-3 · capture the screens, no docker', () => {
  it('captures E-4 and E-9 in light and dark, desk 1440x900 and a portrait phone, each different', async () => {
    const { out, r } = await runSweep(['--only', 'E-4,E-9'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('sweep: 8/8 captures')
    const dir = join(out, 'default')
    expect(readdirSync(dir).sort()).toEqual([
      'E-4-page-dark-desk.png',
      'E-4-page-dark-phone.png',
      'E-4-page-light-desk.png',
      'E-4-page-light-phone.png',
      'E-9-settings-dark-desk.png',
      'E-9-settings-dark-phone.png',
      'E-9-settings-light-desk.png',
      'E-9-settings-light-phone.png',
    ])
    for (const f of readdirSync(dir)) {
      const { w, h } = pngSize(join(dir, f))
      if (f.endsWith('-desk.png')) expect([w, h]).toEqual([1440, 900])
      else {
        // 390x844 CSS pixels: a portrait phone, whatever the pixel ratio.
        expect(h).toBeGreaterThan(w)
        expect(Math.abs(w / h - 390 / 844)).toBeLessThan(0.01)
      }
    }
    expect(sha(join(dir, 'E-4-page-light-desk.png'))).not.toBe(sha(join(dir, 'E-4-page-dark-desk.png')))
    expect(sha(join(dir, 'E-9-settings-light-phone.png'))).not.toBe(
      sha(join(dir, 'E-9-settings-dark-phone.png')),
    )
    expect(sha(join(dir, 'E-4-page-light-desk.png'))).not.toBe(
      sha(join(dir, 'E-4-page-light-phone.png')),
    )
  }, 290_000)

  it('--skin skippy writes under skippy/ and draws something other than the default skin', async () => {
    const a = await runSweep(['--only', 'E-2'])
    const b = await runSweep(['--only', 'E-2', '--skin', 'skippy'])
    expect(a.r.status).toBe(0)
    expect(b.r.status).toBe(0)
    expect(existsSync(join(b.out, 'skippy', 'E-2-home-light-desk.png'))).toBe(true)
    expect(existsSync(join(b.out, 'default'))).toBe(false)
    expect(sha(join(a.out, 'default', 'E-2-home-light-desk.png'))).not.toBe(
      sha(join(b.out, 'skippy', 'E-2-home-light-desk.png')),
    )
  }, 290_000)

  it('exits non-zero, naming the screen, when asked for one that does not exist', async () => {
    const { r } = await runSweep(['--only', 'E-99'])
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('E-99')
  }, 60_000)

  // The criterion itself: 31 screens x 4 variants = 124 pictures, for each of
  // the two skins. About two minutes a skin: opt in with BENCH_FULL_SWEEP=1.
  it.skipIf(process.env.BENCH_FULL_SWEEP !== '1').each([
    ['default', []],
    ['skippy', ['--skin', 'skippy']],
  ] as const)('captures E-1 to E-31 x light/dark x desk/phone: 124 pictures (%s)', async (skin, args) => {
    const { out, r } = await runSweep([...args])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('sweep: 124/124 captures')
    const files = readdirSync(join(out, skin))
    expect(files).toHaveLength(124)
    for (let n = 1; n <= 31; n++) {
      for (const theme of ['light', 'dark']) {
        for (const vp of ['desk', 'phone']) {
          expect(files.some((f) => f.startsWith(`E-${n}-`) && f.endsWith(`-${theme}-${vp}.png`))).toBe(true)
        }
      }
    }
  }, 600_000)
})
