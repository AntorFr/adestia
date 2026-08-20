/**
 * The arming flow, against a fake CLI.
 *
 * The predecessor's lesson, made a rule by the driver contract: a driver's
 * auth path must be testable with no account and no real binary, or it is
 * tested by its first user, at the worst possible moment.
 */

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  armingEnv,
  awaitsCode,
  findAuthorizeUrl,
  findToken,
  looksLikeToken,
  stripAnsi,
} from '../src/claude-code/arming.js'
import { createSetupTokenFlow } from '../src/claude-code/setup-token.js'

const TOKEN = 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz123456'
const ESC = String.fromCharCode(27)

describe('screen scraping', () => {
  it('finds the authorization link', () => {
    const screen = 'Open this link:\n  https://claude.ai/oauth/authorize?code=1  \nthen paste'
    expect(findAuthorizeUrl(screen)).toBe('https://claude.ai/oauth/authorize?code=1')
  })

  it('sees through ANSI colouring', () => {
    // Every regex on this output is wrong without stripping first.
    expect(findAuthorizeUrl(ESC + '[32mhttps://claude.ai/oauth/x' + ESC + '[0m')).toBe(
      'https://claude.ai/oauth/x',
    )
    expect(stripAnsi(ESC + '[1mbold' + ESC + '[0m')).toBe('bold')
  })

  it('recognises the code prompt', () => {
    expect(awaitsCode('Paste code here:')).toBe(true)
    expect(awaitsCode('Enter the code you were given')).toBe(true)
    expect(awaitsCode('still working...')).toBe(false)
  })

  it('finds the token and nothing that merely looks like one', () => {
    expect(findToken('Saved: ' + TOKEN)).toBe(TOKEN)
    expect(findToken('sk-ant-oat01-short')).toBeUndefined()
    expect(findToken('no token here')).toBeUndefined()
  })

  it('validates a token before it is stored', () => {
    // A malformed token fails at the first turn with an error about the CLI,
    // sending its owner to debug the wrong thing entirely.
    expect(looksLikeToken(TOKEN)).toBe(true)
    expect(looksLikeToken('  ' + TOKEN + '  ')).toBe(true)
    expect(looksLikeToken('ghp_something_else')).toBe(false)
    expect(looksLikeToken('')).toBe(false)
  })
})

describe('the environment the flow runs under', () => {
  it('disables the browser', () => {
    // With a browser available the CLI opens the URL and never prints it —
    // and there is no browser on the far side of a web interface anyway.
    expect(armingEnv({}).BROWSER).toBe('/bin/false')
  })

  it('asks for a wide terminal so the link is not wrapped', () => {
    // Wrapped, the URL does not match and the flow appears to hang.
    expect(Number(armingEnv({}).COLUMNS)).toBeGreaterThanOrEqual(200)
  })

  it('keeps the inherited environment', () => {
    expect(armingEnv({ PATH: '/usr/bin' }).PATH).toBe('/usr/bin')
  })
})

/** A fake `claude setup-token`, driven line by line. */
function fakeCli() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdout, stderr, stdin, kill: vi.fn() })
  const written: string[] = []
  stdin.on('data', (chunk: Buffer) => written.push(chunk.toString('utf8')))
  return { child, stdout, written }
}

describe('setup-token flow', () => {
  it('returns the link the CLI printed', async () => {
    const { child, stdout } = fakeCli()
    const flow = createSetupTokenFlow({ spawnImpl: (() => child) as never })

    const started = flow.start()
    stdout.write('Visit https://claude.ai/oauth/authorize?x=1 to continue\n')
    expect(await started).toEqual({ authorizeUrl: 'https://claude.ai/oauth/authorize?x=1' })
  })

  it('waits for the prompt before typing the code', async () => {
    // A code written before the CLI is listening is a code that vanishes.
    const { child, stdout, written } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { enter: 50 },
    })

    stdout.write('https://claude.ai/oauth/x\n')
    await flow.start()

    const submitted = flow.submit('the-code')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(written).toEqual([])

    stdout.write('Paste code here: ')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(written[0]).toBe('the-code')

    stdout.write('\nSaved ' + TOKEN + '\n')
    expect(await submitted).toEqual({ token: TOKEN })
  })

  it('sends the newline separately from the code', async () => {
    // The CLI paste guard swallows an Enter arriving in the same burst.
    const { child, stdout, written } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { enter: 50 },
    })
    stdout.write('https://claude.ai/oauth/x\nPaste code here: ')
    await flow.start()

    const submitted = flow.submit('code')
    await new Promise((resolve) => setTimeout(resolve, 250))
    stdout.write('ok ' + TOKEN)
    await submitted

    expect(written).toEqual(['code', '\n'])
  })

  it('says what the CLI last printed when it times out', async () => {
    // "Timed out" alone is all anyone would ever learn about a flow that
    // failed on a message the CLI was showing.
    const { child, stdout } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { url: 300 },
    })
    stdout.write('Error: you are already logged in elsewhere')

    await expect(flow.start()).rejects.toThrow(/already logged in elsewhere/)
  })

  it('refuses to submit when nothing is running', async () => {
    const flow = createSetupTokenFlow({ spawnImpl: (() => fakeCli().child) as never })
    await expect(flow.submit('code')).rejects.toThrow(/no arming flow is running/)
  })

  it('kills the process when the user gives up', async () => {
    const { child, stdout } = fakeCli()
    const flow = createSetupTokenFlow({ spawnImpl: (() => child) as never })
    stdout.write('https://claude.ai/oauth/x\n')
    await flow.start()
    await flow.cancel()
    expect(child.kill).toHaveBeenCalled()
  })
})
