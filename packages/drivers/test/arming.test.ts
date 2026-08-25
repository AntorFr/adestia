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
  refusedCode,
  findAuthorizeUrl,
  findToken,
  looksLikeToken,
  stripAnsi,
} from '../src/claude-code/arming.js'
import { nativeCliCandidates, resolveClaudeCli } from '../src/claude-code/cli-path.js'
import { createSetupTokenFlow, ptySetupToken } from '../src/claude-code/setup-token.js'

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

  it('recognises the prompt Ink draws with cursor moves', () => {
    // Captured from 2.1.237: every word placed by column, no spaces sent.
    // Replayed onto a screen the spaces come back, so the plain pattern hits.
    const inked = `${ESC}[2GPaste${ESC}[8Gcode${ESC}[13Ghere${ESC}[18Gif${ESC}[21Gprompted${ESC}[30G>`
    expect(awaitsCode(inked)).toBe(true)
    expect(awaitsCode(`${ESC}[2Gstill${ESC}[8Gworking`)).toBe(false)
  })

  it('reads a token the CLI only half re-sent', () => {
    // THE bug behind "did not return a token" on a successful authorization.
    // Ink re-sends only the cells that CHANGED: here the previous frame had
    // already left an `X` where the token happens to carry one, so the stream
    // jumps over it. Read from the stream, the token comes back one character
    // short — a plausible-looking value that is simply not the token.
    const head = 'sk-ant-oat01-' + 'A'.repeat(20)
    const tail = 'B'.repeat(10)
    const token = head + 'X' + tail
    const stream = `${' '.repeat(head.length)}X\r${head}${ESC}[${head.length + 2}G${tail}`

    expect(findToken(stream)).toBe(token)
    expect(findToken(stripAnsi(stream))).toBe(head + tail)
  })

  it('takes the link from the hyperlink, not from the wrapped copy', () => {
    // The CLI prints the URL twice: once as an OSC 8 target, whole, and once
    // as visible text the terminal cuts to its width. Matching the visible
    // one yields a link that looks right and 404s.
    const url = 'https://claude.com/cai/oauth/authorize?code=true&state=' + 'z'.repeat(60)
    const screen = `${ESC}]8;id=h0d9kd;${url}\u0007${url.slice(0, 80)}${ESC}]8;;\u0007`
    expect(findAuthorizeUrl(screen)).toBe(url)
  })

  it('hears the CLI refuse a code', () => {
    // Captured from 2.1.237, cursor moves and all.
    const refusal = `OAuth error: Invalid${ESC}[23Gcode. Please make${ESC}[41Gsure`
    expect(refusedCode(refusal)).toBe(true)
    expect(refusedCode('exchanging…')).toBe(false)
  })

  it('takes the value the CLI points at, whatever its format', () => {
    // The success screen, verbatim from the binary's own strings. If the
    // server ever mints a token that is not `sk-ant-oat…`, the heading is
    // still there and still one line above the value.
    const future = 'claude_oauth_9f2b' + 'Q'.repeat(40)
    const success = [
      'Long-lived authentication token created successfully!',
      '',
      'Your OAuth token (valid for 1 year):',
      '',
      future,
      '',
      "Store this token securely. You won't be able to see it again.",
      'Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>',
    ].join('\n')

    expect(findToken(success)).toBe(future)
    // And it is storable: the CLI presenting it as the token IS the check.
    expect(looksLikeToken(future)).toBe(true)
  })

  it('does not mistake the instructions for the token', () => {
    // `<token>` is a template; the sentences around it are prose. A capture
    // that returns either of them stores garbage under the user's name.
    const noValue = [
      'Your OAuth token (valid for 1 year):',
      "Store this token securely. You won't be able to see it again.",
    ].join('\n')
    expect(findToken(noValue)).toBeUndefined()
    expect(looksLikeToken('export CLAUDE_CODE_OAUTH_TOKEN=<token>')).toBe(false)
    expect(looksLikeToken('Store this token securely.')).toBe(false)
  })

  it('finds the token and nothing that merely looks like one', () => {
    expect(findToken('Saved: ' + TOKEN)).toBe(TOKEN)
    expect(findToken('sk-ant-oat01-short')).toBeUndefined()
    // A later format version is still the known shape.
    expect(findToken('Saved: sk-ant-oat02-' + 'b'.repeat(24))).toBe('sk-ant-oat02-' + 'b'.repeat(24))
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

  it('sends Enter separately from the code, as a carriage return', async () => {
    // Two lessons in one line. The paste guard swallows an Enter arriving in
    // the same burst as the text — and Enter is `\r`: measured, `\n` leaves
    // the code sitting in the field until the flow times out.
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

    expect(written).toEqual(['code', '\r'])
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

  it('reports a refused code at once instead of waiting the exchange out', async () => {
    // The CLI answers in a second; the old flow spent a minute of silence
    // before guessing out loud that the code "may be wrong or expired".
    const { child, stdout } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { enter: 50, exchange: 10_000 },
    })
    stdout.write('https://claude.ai/oauth/x\nPaste code here: ')
    await flow.start()

    const submitted = flow.submit('wrong')
    await new Promise((resolve) => setTimeout(resolve, 250))
    stdout.write('\nOAuth error: Invalid code. Please make sure the full code was copied')

    await expect(submitted).rejects.toThrow(/refused the code — copy the WHOLE code/)
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

describe('finding the CLI', () => {
  // `spawn('claude')` assumed a global install nobody has to do: the binary
  // the SDK already ships is the one every turn runs. Missing it is how the
  // flow died with `spawn claude ENOENT`.
  it('prefers the binary the SDK ships for this platform', () => {
    const path = resolveClaudeCli({
      platform: 'darwin',
      arch: 'arm64',
      resolveImpl: (specifier) => {
        expect(specifier).toBe('@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
        return '/app/node_modules/' + specifier
      },
      exists: () => true,
    })
    expect(path).toBe('/app/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
  })

  it('tries both libc flavours on Linux, this host\'s first', () => {
    // Those packages declare no libc, so a musl host installs BOTH — and the
    // glibc binary cannot even be loaded there.
    expect(nativeCliCandidates('linux', 'x64', false)).toEqual([
      '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude',
    ])
    expect(nativeCliCandidates('linux', 'x64', true)).toEqual([
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude',
      '@anthropic-ai/claude-agent-sdk-linux-x64/claude',
    ])
    expect(nativeCliCandidates('win32', 'x64', false)).toEqual([
      '@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
    ])
  })

  it('falls back to PATH rather than refusing to try', () => {
    // An operator's own install is still a perfectly good CLI.
    expect(
      resolveClaudeCli({
        platform: 'linux',
        arch: 'x64',
        resolveImpl: () => {
          throw new Error('Cannot find module')
        },
        exists: () => false,
      }),
    ).toBe('claude')
  })

  it('resolves the real binary in this workspace', () => {
    // The one assertion here that is not a mock — and the one that would have
    // caught the bug.
    expect(resolveClaudeCli()).toMatch(/claude-agent-sdk-.+[/\\]claude(\.exe)?$/)
  })
})

describe('the terminal the CLI needs', () => {
  // Over a pipe, Ink prints nothing at all and the flow times out on an empty
  // screen. Two tools, because BSD `script` will not take a server's stdin.
  it('wraps the command in a pty and widens it first', () => {
    const linux = ptySetupToken('/opt/claude', ['setup-token'], 'linux')
    expect(linux.file).toBe('script')
    expect(linux.args[0]).toBe('-qec')
    expect(linux.args[1]).toMatch(
      /^stty cols \d{3,} rows \d+; exec '\/opt\/claude' 'setup-token'$/,
    )
    expect(linux.args[2]).toBe('/dev/null')
  })

  it('uses expect on macOS, where BSD script refuses a piped stdin', () => {
    const mac = ptySetupToken('/opt/claude', ['setup-token'], 'darwin')
    expect(mac.file).toBe('expect')
    // `interact` is what joins our pipes to the pty; without it the code we
    // write never reaches the CLI.
    expect(mac.args[1]).toContain('interact')
    expect(mac.args[1]).toContain("stty cols 400 rows 40; exec '/opt/claude' 'setup-token'")
  })

  it('quotes a path either layer would otherwise mangle', () => {
    expect(ptySetupToken("/opt/my cli/cla'ude", [], 'linux').args[1]).toContain(
      `'/opt/my cli/cla'\\''ude'`,
    )
    // Tcl counts braces inside its own quoting, so an unescaped one would
    // truncate the command expect runs.
    expect(ptySetupToken('/opt/{cli}/claude', [], 'darwin').args[1]).toContain(
      `'/opt/\\{cli\\}/claude'`,
    )
  })
})

describe('when the CLI cannot start', () => {
  it('names the missing pty tool instead of waiting out the timeout', async () => {
    // What is spawned is `script`; blaming the CLI would send its reader to
    // the wrong machine entirely.
    const { child } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { url: 5_000 },
    })

    const started = flow.start()
    child.emit('error', Object.assign(new Error('spawn script ENOENT'), { code: 'ENOENT' }))

    await expect(started).rejects.toThrow(/needs `(script|expect)` to give the CLI a terminal/)
  })

  it('reports any other spawn failure as it came', async () => {
    const { child } = fakeCli()
    const flow = createSetupTokenFlow({
      spawnImpl: (() => child) as never,
      timeouts: { url: 5_000 },
    })

    const started = flow.start()
    child.emit('error', new Error('EACCES'))

    await expect(started).rejects.toThrow(/could not be started: EACCES/)
  })
})
