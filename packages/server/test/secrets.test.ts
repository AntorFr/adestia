import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { ARMING_TTL_MS, ArmingSessions, SecretStore } from '../src/secrets.js'

let root: string
let store: SecretStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-secrets-'))
  store = new SecretStore(root)
})

describe('secret storage', () => {
  it('round-trips a token', async () => {
    const written = await store.write('claude-code', 'sk-ant-oat01-abc')
    expect((await store.read('claude-code'))?.value).toBe('sk-ant-oat01-abc')
    expect(written.savedAt).toMatch(/^\d{4}-/)
  })

  it('writes the file readable by nobody else', async () => {
    // A secret at 0644 is a secret every process on the host can read; in a
    // container that is every sidecar too.
    await store.write('claude-code', 'sk-ant-oat01-abc')
    const info = await stat(join(root, 'secrets', 'claude-code.token'))
    expect(info.mode & 0o777).toBe(0o600)
  })

  it('never leaves a temporary file behind', async () => {
    // A .tmp holding a secret is the same secret, under a name nobody thinks
    // to protect.
    await store.write('claude-code', 'sk-ant-oat01-abc')
    expect(await readdir(join(root, 'secrets'))).toEqual(['claude-code.token'])
  })

  it('overwrites cleanly on re-arming', async () => {
    await store.write('claude-code', 'old')
    await store.write('claude-code', 'new')
    expect((await store.read('claude-code'))?.value).toBe('new')
    expect(await readFile(join(root, 'secrets', 'claude-code.token'), 'utf8')).toBe('new\n')
  })

  it('reports nothing for a driver never armed', async () => {
    expect(await store.read('claude-code')).toBeUndefined()
  })

  it('treats an empty file as nothing stored', async () => {
    await store.write('claude-code', '   ')
    expect(await store.read('claude-code')).toBeUndefined()
  })

  it('refuses a driver id that would escape the store', async () => {
    // The driver id comes from a config file someone else may write.
    await expect(store.write('../../etc/passwd', 'x')).rejects.toThrow(/unsafe driver id/)
    await expect(store.read('..')).rejects.toThrow(/unsafe driver id/)
  })

  it('clears', async () => {
    await store.write('claude-code', 'x')
    expect(await store.clear('claude-code')).toBe(true)
    expect(await store.read('claude-code')).toBeUndefined()
  })

  it('reports a clear that matched nothing', async () => {
    expect(await store.clear('claude-code')).toBe(false)
  })
})

describe('arming sessions', () => {
  it('hands out a session', () => {
    const sessions = new ArmingSessions()
    const session = sessions.start('claude-code', 1000)
    expect(sessions.get(session.id, 1000)).toEqual(session)
  })

  it('keeps only one alive at a time', () => {
    // Two overlapping flows produce two codes, and the user pastes whichever
    // they saw last into whichever is still waiting.
    const sessions = new ArmingSessions()
    const first = sessions.start('claude-code', 1000)
    const second = sessions.start('claude-code', 2000)
    expect(sessions.get(first.id, 2000)).toBeUndefined()
    expect(sessions.get(second.id, 2000)).toEqual(second)
  })

  it('expires', () => {
    const sessions = new ArmingSessions()
    const session = sessions.start('claude-code', 1000)
    expect(sessions.get(session.id, 1000 + ARMING_TTL_MS - 1)).toBeTruthy()
    expect(sessions.get(session.id, 1000 + ARMING_TTL_MS)).toBeUndefined()
  })

  it('forgets an expired session rather than keeping it around', () => {
    const sessions = new ArmingSessions()
    const session = sessions.start('claude-code', 1000)
    sessions.get(session.id, 1000 + ARMING_TTL_MS)
    expect(sessions.current).toBeUndefined()
  })

  it('ends on demand', () => {
    const sessions = new ArmingSessions()
    const session = sessions.start('claude-code', 1000)
    sessions.end(session.id)
    expect(sessions.get(session.id, 1000)).toBeUndefined()
  })

  it('ignores an end for someone else session', () => {
    const sessions = new ArmingSessions()
    const session = sessions.start('claude-code', 1000)
    sessions.end('not-a-session')
    expect(sessions.get(session.id, 1000)).toEqual(session)
  })
})
