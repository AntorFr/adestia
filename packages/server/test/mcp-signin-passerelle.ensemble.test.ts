/**
 * Feature adestia-mcp-cle-par-serveur, seen from the door a person uses: the
 * sign-in routes, then a turn. Real app, real routes, real McpSignIn on a real
 * data directory; only the authorization server (a gateway handing ONE client
 * to every registration) is faked, through the injected fetch.
 *
 * Need (Livre, critère de sortie): with two MCP servers connected by one person
 * behind one authorization server and one client, revoking the first server's
 * key does not stop the second from getting its token, each server refreshes
 * with its own key, and after a restart each server restarts from its own
 * rotated key.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { McpSignIn } from '../src/mcp-signin.js'
import { RESULT, ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const SERVERS = (dataDir: string) =>
  parseConfig(`
auth:
  mode: none
dataDir: ${dataDir}
mcp:
  servers:
    - name: home-assistant
      url: https://gw.example/ha/
      identity: user
      signIn: oauth
    - name: jira
      url: https://gw.example/jira/
      identity: user
      signIn: oauth
`)

/** A gateway: one IdP, one client_id for every registration, rotating refresh keys. */
function gateway() {
  const log = { refreshes: [] as string[] }
  const revoked = new Set<string>()
  const valid = new Set<string>()
  let issued = 0
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const issue = () => {
    issued += 1
    valid.add(`refresh-${issued}`)
    return json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 3600 })
  }
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === 'https://gw.example/.well-known/oauth-authorization-server') {
      return json({
        authorization_endpoint: 'https://gw.example/idp/auth',
        token_endpoint: 'https://gw.example/idp/token',
        registration_endpoint: 'https://gw.example/idp/register',
      })
    }
    if (url === 'https://gw.example/idp/register') return json({ client_id: 'shared' }, 201)
    if (url === 'https://gw.example/idp/token') {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') {
        return body.get('code') === 'good-code' ? issue() : json({ error: 'invalid_grant' }, 400)
      }
      const presented = body.get('refresh_token') ?? ''
      log.refreshes.push(presented)
      if (revoked.has(presented) || !valid.has(presented)) return json({ error: 'invalid_grant' }, 400)
      valid.delete(presented)
      return issue()
    }
    return json({ error: 'not found' }, 404)
  }) as typeof fetch
  return { fetchImpl, log, revoke: (key: string) => revoked.add(key) }
}

type App = Awaited<ReturnType<typeof buildApp>>

async function boot(dataDir: string, fetchImpl: typeof fetch) {
  const driver = new ScriptedDriver([RESULT])
  const app = await buildApp({
    config: SERVERS(dataDir),
    driver,
    plugins: [],
    pluginProblems: [],
    mcpSignIn: new McpSignIn(dataDir, fetchImpl),
  })
  return { app, driver }
}

/** The person's gesture: the sign-in route, the provider, the callback route. */
async function connect(app: App, server: string) {
  const start = await app.inject({ method: 'GET', url: `/api/mcp/signin/${server}` })
  expect(start.statusCode).toBe(302)
  const state = new URL(String(start.headers.location)).searchParams.get('state')!
  const back = await app.inject({
    method: 'GET',
    url: `/api/mcp/signin/callback?state=${state}&code=good-code`,
  })
  expect(back.body).toContain('Connecté')
}

const turn = (app: App) =>
  app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'bonjour' } })

describe('two MCP servers behind one gateway client (E-10 sign-in routes, then a turn)', () => {
  it('each connected server reaches the turn with a token minted from its own key', async () => {
    const dataDir = await tmpDir('adestia-passerelle-')
    const idp = gateway()
    const { app, driver } = await boot(dataDir, idp.fetchImpl)
    await connect(app, 'home-assistant')
    await connect(app, 'jira')
    await turn(app)

    expect(driver.requests[0]!.serverTokens).toEqual({
      'home-assistant': 'access-3',
      jira: 'access-4',
    })
    expect(idp.log.refreshes).toEqual(['refresh-1', 'refresh-2'])
    await app.close()
  })

  it('first server’s key revoked: the second still gets its token, and restarts from its own rotated key', async () => {
    const dataDir = await tmpDir('adestia-passerelle-')
    const idp = gateway()
    const first = await boot(dataDir, idp.fetchImpl)
    await connect(first.app, 'home-assistant')
    await connect(first.app, 'jira')
    idp.revoke('refresh-1')
    await turn(first.app)

    expect(first.driver.requests[0]!.serverTokens).toEqual({ jira: 'access-3' })
    expect(idp.log.refreshes).toEqual(['refresh-1', 'refresh-2'])
    await first.app.close()

    // Restart: a new process, the same data directory.
    const second = await boot(dataDir, idp.fetchImpl)
    await turn(second.app)
    expect(second.driver.requests[0]!.serverTokens).toEqual({ jira: 'access-4' })
    expect(idp.log.refreshes.at(-1)).toBe('refresh-3')
    await second.app.close()
  })

  it('a server nobody connected does not borrow the connected one’s key', async () => {
    const dataDir = await tmpDir('adestia-passerelle-')
    const idp = gateway()
    const { app, driver } = await boot(dataDir, idp.fetchImpl)
    await connect(app, 'jira')
    await turn(app)

    expect(driver.requests[0]!.serverTokens).toEqual({ jira: 'access-2' })
    expect(idp.log.refreshes).toEqual(['refresh-1'])
    await app.close()
  })
})
