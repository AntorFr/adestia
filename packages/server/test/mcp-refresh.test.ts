/**
 * Where a rotated MCP refresh token lives between restarts.
 *
 * One property decides whether anybody is still logged in next month: a write
 * that fails must not stop the NEXT one from being attempted. The store
 * serializes its writes through a promise chain, and a chain that keeps a
 * rejection is a chain that never runs anything again — a failure mode that
 * shows up days later, as a login nobody can explain.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FileRefreshStore } from '../src/mcp-refresh.js'

const settle = (promise: Promise<unknown>) => promise.then(() => 'ok' as const, () => 'failed' as const)

describe('the refresh token store', () => {
  it('keeps what it was given, and reads it back', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-refresh-'))
    const store = new FileRefreshStore(dataDir)

    await store.save('https://idp|client', 'rotated-once')

    expect(await store.load('https://idp|client')).toBe('rotated-once')
    expect(await new FileRefreshStore(dataDir).load('https://idp|client')).toBe('rotated-once')
  })

  it('writes the file readable by nobody else', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-refresh-'))
    await new FileRefreshStore(dataDir).save('k', 'v')

    const { mode } = await import('node:fs/promises').then((fs) =>
      fs.stat(join(dataDir, 'secrets', 'mcp-refresh.json')),
    )
    // A refresh token is a key to somebody's account: 0600, like the
    // credential it sits beside.
    expect(mode & 0o777).toBe(0o600)
  })

  it('attempts the next write after one has failed', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-refresh-'))
    // `secrets` exists as a FILE, so the write cannot land.
    await writeFile(join(dataDir, 'secrets'), 'in the way')
    const said: string[] = []
    const store = new FileRefreshStore(dataDir, (message) => said.push(message))

    expect(await settle(store.save('k', 'v1'))).toBe('failed')
    // The obstacle is gone. A store whose chain kept the rejection would fail
    // here too, without even trying — and would go on failing forever.
    await rm(join(dataDir, 'secrets'))
    await mkdir(join(dataDir, 'secrets'))

    expect(await settle(store.save('k', 'v2'))).toBe('ok')
    expect(await store.load('k')).toBe('v2')
  })

  it('says a failed write out loud', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-refresh-'))
    await writeFile(join(dataDir, 'secrets'), 'in the way')
    const said: string[] = []
    const store = new FileRefreshStore(dataDir, (message) => said.push(message))

    await settle(store.save('k', 'v'))

    // The turn survives on the token held in memory, so nothing else would
    // ever mention this until a restart asked for a login.
    expect(said.join(' ')).toMatch(/not persisted/)
    expect(said.join(' ')).toMatch(/restart/)
  })

  it('does not lose one identity token while rotating another', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-refresh-'))
    const store = new FileRefreshStore(dataDir)

    await Promise.all([store.save('hub-a|c', 'a1'), store.save('hub-b|c', 'b1')])

    const written = JSON.parse(await readFile(join(dataDir, 'secrets', 'mcp-refresh.json'), 'utf8'))
    expect(written).toEqual({ 'hub-a|c': 'a1', 'hub-b|c': 'b1' })
  })
})
