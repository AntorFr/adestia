/**
 * AD-zombies-1: the container's PID 1 is an init that reaps orphans.
 * (1) the Dockerfile says so; (2) real processes under `tini -s` — no Docker in the pods.
 * `tini` absent from the environment makes (2) FAIL, never skip.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const code = readFileSync(join(root, 'Dockerfile'), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')

describe('Dockerfile — init (AD-zombies-1)', () => {
  it('installs tini in the apt layer of the runtime stage', () => {
    // red if tini is not installed (before the work: the image had no init)
    const runtime = code.split(/^FROM /m).slice(1).find((s) => /\bAS runtime\b/.test(s)) ?? ''
    expect(runtime).toMatch(/apt-get install[^\n]*\btini\b/)
  })

  it('the entrypoint is tini first, the server script last, JSON form', () => {
    // red if the entrypoint is the bare node command, tini is not first, or the server is not last
    const m = code.match(/^ENTRYPOINT (\[.*\])\s*$/m)
    expect(m).not.toBeNull()
    const argv = JSON.parse(m![1] ?? '[]') as string[]
    expect(argv[0]).toBe('tini')
    expect(argv.at(-1)).toBe('packages/server/bin/adestia.js')
    expect(argv).toEqual(['tini', '--', 'node', 'packages/server/bin/adestia.js'])
  })

  it('does not rely on docker --init or compose init: true', () => {
    expect(code).not.toMatch(/--init\b/)
  })
})

const states = (): Map<number, { state: string; ppid: number }> => {
  const out = new Map<number, { state: string; ppid: number }>()
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8')
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      out.set(Number(d), { state: rest[0] ?? '', ppid: Number(rest[1]) })
    } catch {
      /* gone */
    }
  }
  return out
}
const until = async (f: () => boolean, ms = 10000) => {
  const end = Date.now() + ms
  while (!f()) {
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

const SCRIPT = `
const { spawn } = require('node:child_process')
process.on('SIGTERM', () => { console.log('TERM-HANDLER'); process.exit(42) })
// a parent that starts two grandchildren and dies at once: they are orphans
const parent = spawn('sh', ['-c', 'sleep 60 >/dev/null 2>&1 & echo $!; sleep 60 >/dev/null 2>&1 & echo $!; exit 0'], { stdio: ['ignore', 'pipe', 'inherit'] })
let out = ''
parent.stdout.on('data', (d) => { out += d })
parent.on('close', () => {
  console.log('PIDS ' + out.trim().split('\\n').join(','))
  setInterval(() => {}, 1000)
})
`

describe('real processes under tini -s (AD-zombies-1)', () => {
  it('control: the detector sees a zombie when nobody reaps (a parent that never waits)', async () => {
    const p = spawn('sh', ['-c', 'sleep 0.1 & exec sleep 5'], { stdio: 'ignore' })
    try {
      await until(() => [...states().values()].some((s) => s.state === 'Z' && s.ppid === p.pid))
    } finally {
      p.kill('SIGKILL')
    }
  })

  it('tini exists in the environment', () => {
    // fails, never skips
    expect(spawnSync('tini', ['--version']).status).toBe(0)
  })

  it('orphans killed after their parent died leave no Z entry; SIGTERM reaches the script, which exits with its own code', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tini-'))
    const file = join(dir, 'tree.cjs')
    writeFileSync(file, SCRIPT)
    const tini = spawn('tini', ['-s', '--', process.execPath, file], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    tini.stdout.on('data', (d) => { out += d })
    const exited = new Promise<{ code: number | null; signal: string | null }>((res) =>
      tini.on('exit', (code, signal) => res({ code, signal })),
    )
    try {
      await until(() => /PIDS [\d,]+\n/.test(out))
      const pids = (out.match(/PIDS ([\d,]+)/)?.[1] ?? '').split(',').map(Number)
      expect(pids).toHaveLength(2)
      // the parent is gone: the orphans live, adopted by tini (ppid = tini)
      await until(() => pids.every((p) => states().get(p)?.ppid === tini.pid))
      for (const p of pids) process.kill(p, 'SIGKILL')
      await until(() => pids.every((p) => !states().has(p)))
      expect([...states().entries()].filter(([, s]) => s.state === 'Z' && s.ppid === tini.pid)).toEqual([])

      tini.kill('SIGTERM')
      const r = await exited
      expect(out).toContain('TERM-HANDLER')
      expect(r).toEqual({ code: 42, signal: null })
    } finally {
      tini.kill('SIGKILL')
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30000)
})
