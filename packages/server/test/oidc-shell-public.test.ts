/**
 * The shell is public under OIDC, and only the shell (AD-acces-refuse-1,
 * P-1 step 4): the SignInGate and RefusedGate are part of the bundle, so it
 * must load with no session. API, plugins, skin and every other document keep
 * their guard.
 *
 * The expected statuses are written by hand from the criterion.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { SESSION_COOKIE, signPayload } from '../src/oidc.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const SECRET = 'a-test-secret-long-enough-to-pass'

const OIDC = [
  'auth:',
  '  mode: oidc',
  '  oidc:',
  '    issuer: http://127.0.0.1:1',
  '    clientId: adestia',
  '    clientSecret: s',
  '    redirectUri: https://adestia.example/auth/callback',
  '    groupsClaim: groups',
  '    allowedGroups: [famille]',
  `    sessionSecret: ${SECRET}`,
].join('\n')

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
  await cleanTmp()
})

const boot = async (yaml: string | undefined = OIDC) => {
  const webRoot = await tmpDir('adestia-shell-web-')
  await mkdir(join(webRoot, 'assets', 'deep'), { recursive: true })
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>SHELL</title>')
  await writeFile(join(webRoot, 'assets', 'app.js'), 'export {}')
  await writeFile(join(webRoot, 'assets', 'deep', 'chunk.css'), 'a{}')
  await writeFile(join(webRoot, 'sw.js'), 'self')
  const skin = await tmpDir('adestia-shell-skin-')
  await writeFile(join(skin, 'theme.css'), 'b{}')
  app = await buildApp({
    config: parseConfig(yaml ?? ''),
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: [],
    pluginProblems: [],
    webRoot,
    skin: { dir: skin } as never,
  })
  return app
}

describe('under OIDC, with no session', () => {
  it('serves the document of the shell at / instead of redirecting', async () => {
    await boot()
    const r = await app!.inject({ url: '/', headers: { accept: 'text/html' } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('SHELL')
  })

  it('serves / with a query string, and HEAD', async () => {
    await boot()
    expect((await app!.inject({ url: '/?x=1' })).statusCode).toBe(200)
    expect((await app!.inject({ method: 'HEAD', url: '/' })).statusCode).toBe(200)
  })

  it('serves every file of the bundle, nested ones included', async () => {
    await boot()
    for (const path of ['/index.html', '/assets/app.js', '/assets/deep/chunk.css', '/sw.js']) {
      const r = await app!.inject({ url: path })
      expect(r.statusCode, path).toBe(200)
    }
  })

  it('keeps the API behind its guard (401)', async () => {
    await boot()
    for (const url of ['/api/instance', '/api/threads', '/api/nothing-here']) {
      expect((await app!.inject({ url })).statusCode, url).toBe(401)
    }
  })

  it('keeps /plugins/* and /skin/* guarded', async () => {
    await boot()
    for (const url of ['/plugins/x/index.js', '/skin/theme.css']) {
      const r = await app!.inject({ url, headers: { accept: 'text/html' } })
      expect(r.statusCode, url).not.toBe(200)
      expect([302, 401], url).toContain(r.statusCode)
    }
  })

  it('keeps any other document guarded: not listed, not public', async () => {
    await boot()
    for (const url of [
      '/threads/abc', // a client-side route the shell would answer, but not a listed file
      '/assets/missing.js',
      '/assets/', // a directory is not a file
      '/assets',
      '/assets/app.js/', // exact paths, no loose match
      '/%61ssets/app.js', // encoded spelling is not the listed path
      '/index.htm',
    ]) {
      const r = await app!.inject({ url, headers: { accept: 'text/html' } })
      expect([302, 401], url).toContain(r.statusCode)
    }
  })

  it('only opens GET and HEAD: a POST on a listed path is still guarded', async () => {
    await boot()
    for (const url of ['/', '/assets/app.js']) {
      const r = await app!.inject({ method: 'POST', url, payload: {} })
      expect([302, 401, 403], url).toContain(r.statusCode)
    }
    expect((await app!.inject({ method: 'PUT', url: '/index.html' })).statusCode).not.toBe(200)
  })

  it('redirects a guarded document to /auth/login, as before', async () => {
    await boot()
    const r = await app!.inject({ url: '/threads/abc', headers: { accept: 'text/html' } })
    expect(r.statusCode).toBe(302)
    expect(String(r.headers['location'])).toContain('/auth/login')
  })
})

describe('under OIDC, with a session', () => {
  it('still serves the shell and the API', async () => {
    await boot()
    const cookie = signPayload(
      { userId: 'alice', displayName: 'Alice', groups: ['famille'], expiresAt: Date.now() + 60_000 },
      SECRET,
    )
    const r = await app!.inject({ url: '/', cookies: { [SESSION_COOKIE]: cookie } })
    expect(r.statusCode).toBe(200)
  })
})

describe('without OIDC', () => {
  it('serves the shell as before', async () => {
    await boot('')
    expect((await app!.inject({ url: '/' })).statusCode).toBe(200)
    expect((await app!.inject({ url: '/assets/app.js' })).statusCode).toBe(200)
  })
})
