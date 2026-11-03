/**
 * Ensemble tests for the feature `adestia-copilot-auth`, written from the need
 * (the feature's "Livre" and exit criterion: with CLI 1.0.98 the token arms; an
 * unrecognised refusal shows the cause the CLI gave, with no token in clear;
 * the old format is still read) and run through `start()`, the entry point of
 * the server, with the real CopilotDriver and a fake `copilot` binary on disk.
 *
 * Expectations are literals taken from the need, never read back from the code.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { start, type StartedInstance } from '../src/start.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

let root: string
let started: StartedInstance | undefined

beforeEach(async () => {
  root = await tmpDir('adestia-copilot-auth-')
})
afterEach(async () => {
  await started?.close()
  started = undefined
})

const NEW_TOKEN = 'gho_NewFormatToken0123456789abcdefABCD'
const OLD_TOKEN = 'gho_OldFormatToken0123456789abcdefABCD'

interface Behaviour {
  /** The body of `$COPILOT_HOME/config.json` the fake login writes (after `//` comment lines). */
  readonly config?: unknown
  /** What the fake binary prints on stderr for a turn, then it exits 1. Absent: it answers normally. */
  readonly refusal?: string
}

/** A fake `copilot` as a node script: `login --device-code` under a pty, or a turn. */
async function fakeBinary(behaviour: Behaviour): Promise<string> {
  const file = join(root, 'copilot')
  await writeFile(
    file,
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const behaviour = ${JSON.stringify(behaviour)}
if (process.argv[2] === 'login') {
  console.log('To authenticate, visit https://github.com/login/device and enter code ABCD-1234')
  process.stdout.write('System keychain unavailable. Store token in plaintext config file? (y/N) ')
  process.stdin.setEncoding('utf8')
  process.stdin.once('data', () => {
    if (behaviour.config !== undefined) {
      fs.mkdirSync(process.env.COPILOT_HOME, { recursive: true })
      fs.writeFileSync(
        path.join(process.env.COPILOT_HOME, 'config.json'),
        '// User settings\\n// Do not edit by hand\\n' + JSON.stringify(behaviour.config),
      )
    }
    console.log('Signed in successfully as octo!')
    process.exit(0)
  })
} else if (behaviour.refusal !== undefined) {
  process.stderr.write(behaviour.refusal)
  process.exit(1)
} else {
  const line = (type, data) => console.log(JSON.stringify({ type, data }))
  const said = 'armed with ' + (process.env.COPILOT_GITHUB_TOKEN || 'nothing')
  line('assistant.message_delta', { deltaContent: said })
  line('assistant.message', { content: said })
  line('result', { sessionId: 'sess-1', exitCode: 0 })
}
`,
  )
  await chmod(file, 0o755)
  return file
}

async function boot(behaviour: Behaviour) {
  const command = await fakeBinary(behaviour)
  const dataDir = join(root, 'data')
  await mkdir(dataDir, { recursive: true })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `auth:\n  mode: none\nport: 0\ndataDir: ${dataDir}\ndriver:\n  id: copilot-cli\n  command: ${command}\n`,
  )
  started = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
  return { app: started.app, dataDir }
}

/** The whole arming journey the screen drives: begin, then complete. */
async function arm(app: StartedInstance['app']) {
  const begun = await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })
  expect(begun.statusCode).toBe(200)
  const prompt = begun.json() as { sessionId: string }
  const completed = await app.inject({
    method: 'POST',
    url: '/api/auth/driver/complete',
    payload: { sessionId: prompt.sessionId, input: 'approved' },
  })
  return { begun, completed }
}

const status = async (app: StartedInstance['app']) =>
  (await app.inject({ url: '/api/auth/driver' })).json() as { state?: string; armed?: boolean }

async function turn(app: StartedInstance['app']): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'salut' } })
  return response.body
}

describe('arming the token after a Copilot login', () => {
  it('arms from the CLI 1.0.98 format (authTokens, a { token } object per host/account/provider)', async () => {
    // Breaks if the harvest stops reading `authTokens`.
    const { app, dataDir } = await boot({
      config: { authTokens: { 'https://github.com:octo:copilot': { token: NEW_TOKEN } } },
    })
    const { begun, completed } = await arm(app)
    expect(begun.json()).toMatchObject({ mode: 'device-code', userCode: 'ABCD-1234' })
    expect(completed.statusCode).toBe(200)
    expect(completed.json()).toMatchObject({ armed: true })
    expect(await readFile(join(dataDir, 'secrets', 'copilot-cli.token'), 'utf8')).toContain(NEW_TOKEN)
    // And the next turn runs with that token in the CLI's environment.
    expect(await turn(app)).toContain(`armed with ${NEW_TOKEN}`)
  })

  it('never sends the token back to the browser', async () => {
    // Breaks if the complete response or the status leaks the secret.
    const { app } = await boot({
      config: { authTokens: { 'https://github.com:octo:copilot': { token: NEW_TOKEN } } },
    })
    const { begun, completed } = await arm(app)
    const status1 = await app.inject({ url: '/api/auth/driver' })
    for (const body of [begun.body, completed.body, status1.body]) {
      expect(body).not.toContain(NEW_TOKEN)
    }
  })

  it('still arms from the old format (copilotTokens) when that is all there is', async () => {
    // Breaks if the legacy fallback is removed.
    const { app, dataDir } = await boot({
      config: { copilotTokens: { 'https://github.com:octo': OLD_TOKEN } },
    })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(200)
    expect(completed.json()).toMatchObject({ armed: true })
    expect(await readFile(join(dataDir, 'secrets', 'copilot-cli.token'), 'utf8')).toContain(OLD_TOKEN)
  })

  it('prefers the 1.0.98 format over the old one when an upgraded config holds both', async () => {
    // Breaks if the old format is read first. The old one is listed first on purpose.
    const { app, dataDir } = await boot({
      config: {
        copilotTokens: { 'https://github.com:octo': OLD_TOKEN },
        authTokens: { 'https://github.com:octo:copilot': { token: NEW_TOKEN } },
      },
    })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(200)
    const stored = await readFile(join(dataDir, 'secrets', 'copilot-cli.token'), 'utf8')
    expect(stored).toContain(NEW_TOKEN)
    expect(stored).not.toContain(OLD_TOKEN)
  })

  it('falls back on the old format when the 1.0.98 entries hold no token', async () => {
    // Breaks if an empty authTokens entry hides a usable legacy token.
    const { app, dataDir } = await boot({
      config: {
        authTokens: { 'https://github.com:octo:copilot': {}, 'https://github.com:octo:other': { token: '' } },
        copilotTokens: { 'https://github.com:octo': OLD_TOKEN },
      },
    })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(200)
    expect(await readFile(join(dataDir, 'secrets', 'copilot-cli.token'), 'utf8')).toContain(OLD_TOKEN)
  })

  it('takes a token from a later host entry when the first holds none', async () => {
    const { app, dataDir } = await boot({
      config: {
        authTokens: {
          'https://github.com:a:copilot': { note: 'no token here' },
          'https://github.com:b:copilot': { token: NEW_TOKEN },
        },
      },
    })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(200)
    expect(await readFile(join(dataDir, 'secrets', 'copilot-cli.token'), 'utf8')).toContain(NEW_TOKEN)
  })

  it('does not arm, and says so, when the login stored no token in either format', async () => {
    const { app } = await boot({ config: { authTokens: {}, copilotTokens: {} } })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(502)
    expect(completed.json()).not.toHaveProperty('armed')
    expect((await status(app)).state).toBe('absent')
  })

  it('does not arm when the login wrote no config file at all', async () => {
    const { app } = await boot({})
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(502)
    expect((await status(app)).state).toBe('absent')
  })

  it('refuses a stored credential Copilot would not accept (a classic ghp_ token)', async () => {
    const { app } = await boot({
      config: { authTokens: { 'https://github.com:octo:copilot': { token: 'ghp_ClassicToken0123456789abcdefABCDEF' } } },
    })
    const { completed } = await arm(app)
    expect(completed.statusCode).toBe(502)
    expect((await status(app)).state).toBe('absent')
  })
})

describe('a refusal to authenticate that the driver does not recognise', () => {
  const REASON = 'certificate verify failed: unable to get local issuer certificate'

  it('quotes the CLI’s own words in the turn error, and does not send the user to server logs', async () => {
    // Breaks if the message goes back to a generic sentence.
    const { app } = await boot({ refusal: `Error: could not authenticate: ${REASON}\n` })
    const body = await turn(app)
    expect(body).toContain('event: error')
    expect(body).toContain(REASON)
    expect(body.toLowerCase()).not.toContain('server log')
  })

  it('quotes the end of a long stderr, not its beginning', async () => {
    // "fin de sa sortie d'erreur": the cause comes last, the preamble is dropped.
    const preamble = `Error: authentication problem START_MARKER\n${'noise line of progress output\n'.repeat(100)}`
    const { app } = await boot({ refusal: `${preamble}final cause: ${REASON}\n` })
    const body = await turn(app)
    expect(body).toContain(REASON)
    expect(body).not.toContain('START_MARKER')
  })

  it('masks every gh*_ token the CLI printed', async () => {
    // Breaks if the quoted stderr is not scrubbed.
    const tokens = [
      'gho_SecretOAuthToken0123456789abcdef',
      'ghp_SecretClassicToken0123456789abcd',
      'ghu_SecretUserToken0123456789abcdefg',
      'ghs_SecretServerToken0123456789abcde',
    ]
    const { app } = await boot({
      refusal: `Error: authentication failed for ${tokens.join(' and ')}: ${REASON}\n`,
    })
    const body = await turn(app)
    expect(body).toContain(REASON)
    for (const token of tokens) expect(body).not.toContain(token)
    expect(body).not.toMatch(/gh[a-z]_Secret/)
  })

  it('does not echo the armed token either', async () => {
    // The armed token is what the CLI most likely repeats back.
    const { app } = await boot({
      config: { authTokens: { 'https://github.com:octo:copilot': { token: NEW_TOKEN } } },
      refusal: `Error: authentication refused for token ${NEW_TOKEN}: ${REASON}\n`,
    })
    await arm(app)
    const body = await turn(app)
    expect(body).toContain(REASON)
    expect(body).not.toContain(NEW_TOKEN)
  })
})
