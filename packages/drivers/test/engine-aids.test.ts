import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DeviceCodeFlow } from '../src/device-code.js'
import { classifyAuthError as codexClassify } from '../src/codex-cli/auth.js'
import { classifyAuthError as copilotClassify } from '../src/copilot-cli/auth.js'
import { health, truncate, usageOf } from '../src/engine-aids.js'

describe('truncate', () => {
  it('flattens newlines so tool input cannot mimic trace structure', () => {
    expect(truncate('  a\n\n b\t c ')).toBe('a b c')
  })
  it('keeps 78 characters whole and cuts 79 to 77 plus an ellipsis', () => {
    expect(truncate('x'.repeat(78))).toBe('x'.repeat(78))
    expect(truncate('x'.repeat(79))).toBe(`${'x'.repeat(77)}…`)
  })
})

describe('health', () => {
  const words = new Map<string, 'connected' | 'failed'>([['ready', 'connected'], ['failed', 'failed']])
  it('maps a known word, and a never-met word to unknown rather than failed', () => {
    expect(health('s', 'ready', undefined, words)).toEqual({ name: 's', state: 'connected' })
    expect(health('s', 'weird', undefined, words)).toEqual({ name: 's', state: 'unknown' })
    expect(health('s', undefined, undefined, words)).toEqual({ name: 's', state: 'unknown' })
    expect(health('s', 'toString', undefined, words).state).toBe('unknown')
  })
  it('carries the error only when there is one', () => {
    expect(health('s', 'failed', 'boom', words)).toEqual({ name: 's', state: 'failed', error: 'boom' })
    expect(health('s', 'failed', '', words)).toEqual({ name: 's', state: 'failed' })
  })
})

describe('usageOf', () => {
  it('leaves absent counters out but keeps zero and null', () => {
    expect(usageOf({ inputTokens: 0, outputTokens: undefined, costUsd: null })).toEqual({ inputTokens: 0, costUsd: null })
  })
})

describe('auth error classification', () => {
  it('codex: invalid key wins over a bare 401, case-insensitively', () => {
    expect(codexClassify('401 Unauthorized: Incorrect API key provided')).toBe('invalid')
    expect(codexClassify('Missing bearer or basic authentication')).toBe('absent')
    expect(codexClassify('401 unauthorized')).toBe('unknown')
    expect(codexClassify('all fine')).toBeUndefined()
  })
  it('copilot: unknown needs both "error:" and "authenticat"', () => {
    expect(copilotClassify('Error: could not authenticate')).toBe('unknown')
    expect(copilotClassify('error: disk full')).toBeUndefined()
    expect(copilotClassify('authenticating...')).toBeUndefined()
    expect(copilotClassify('No authentication information found. error: authenticate')).toBe('absent')
  })
})

describe('DeviceCodeFlow', () => {
  async function make() {
    const home = await mkdtemp(join(tmpdir(), 'dcf-'))
    const cancelled: string[] = []
    const flow = new DeviceCodeFlow({
      home,
      sessionId: 'sid',
      extraPrompt: { consent: 'yes' },
      start: async (h) => {
        const id = `login${cancelled.length}-${Math.random()}`
        return { verificationUri: 'https://x', userCode: 'ABCD', cancel: () => void cancelled.push(id), id, h }
      },
    })
    return { home, flow, cancelled }
  }

  it('finish without begin throws, cancel without begin is a no-op', async () => {
    const { flow } = await make()
    await expect(flow.finish(async () => 1)).rejects.toThrow('no device-code login is in progress; start again')
    await flow.cancel()
    expect(flow.active).toBe(false)
  })
  it('begin returns the prompt with extras and a 900 s ttl, and creates the arming home', async () => {
    const { flow, home } = await make()
    const prompt = await flow.begin()
    expect(prompt).toEqual({
      sessionId: 'sid', mode: 'device-code', authorizeUrl: 'https://x', userCode: 'ABCD',
      inputLabel: 'Approve in your browser, then finish here', consent: 'yes', ttl: 900,
    })
    expect(await readdir(home)).toEqual(['arming'])
    expect(flow.active).toBe(true)
  })
  it('a second begin cancels the first login', async () => {
    const { flow, cancelled } = await make()
    await flow.begin()
    await flow.begin()
    expect(cancelled).toHaveLength(1)
  })
  it('finish removes the home and clears pending on success AND on failure', async () => {
    const { flow, home } = await make()
    await flow.begin()
    await expect(flow.finish(async () => 'tok')).resolves.toBe('tok')
    expect(await readdir(home)).toEqual([])
    expect(flow.active).toBe(false)
    await flow.begin()
    await expect(flow.finish(async () => { throw new Error('nope') })).rejects.toThrow('nope')
    expect(await readdir(home)).toEqual([])
    expect(flow.active).toBe(false)
  })
  it('cancel cancels the login, removes the home, clears pending', async () => {
    const { flow, home, cancelled } = await make()
    await flow.begin()
    await flow.cancel()
    expect(cancelled).toHaveLength(1)
    expect(await readdir(home)).toEqual([])
    expect(flow.active).toBe(false)
  })
})
