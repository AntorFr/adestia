/**
 * The route table of the mounted application, pinned.
 *
 * A characterisation test: it records every (method, path) the app registers,
 * in registration order, and fixes it. Moving a route's code between files
 * must leave this list exactly as it is — the URL, the method, and the place
 * in the order, with the shell's catch-all last.
 */

import { AskDesk } from '@antorfr/adestia-drivers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseConfig } from '../src/config.js'
import { RESULT, ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const recorded = vi.hoisted(() => [] as string[])

// Wrap the factory so every route the application registers — in a plugin or
// not — is seen as it is added, which keeps the order.
vi.mock('fastify', async (importOriginal) => {
  const original = await importOriginal<typeof import('fastify')>()
  const wrapped = ((...args: unknown[]) => {
    const app = (original.default as (...a: unknown[]) => ReturnType<typeof original.default>)(...args)
    app.addHook('onRoute', (route: { method: string | readonly string[]; url: string }) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method]
      for (const method of methods) recorded.push(`${method} ${route.url}`)
    })
    return app
  }) as typeof original.default
  return { ...original, default: wrapped }
})

const { buildApp } = await import('../src/app.js')

afterEach(cleanTmp)

const driver = () => new ScriptedDriver([{ type: 'text-delta', text: 'hi' }, RESULT])

async function tableOf(yaml: string, extra: Record<string, unknown> = {}): Promise<string[]> {
  recorded.length = 0
  const dataDir = await tmpDir('adestia-routes-')
  const config = parseConfig(yaml)
  await buildApp({
    config: { ...config, dataDir },
    driver: driver(),
    plugins: [],
    pluginProblems: [],
    ...extra,
  })
  return [...recorded].filter((line) => !line.startsWith('HEAD '))
}

describe('the route table', () => {
  it('lists every route of a fully-equipped instance, the catch-all last', async () => {
    const webRoot = await tmpDir('adestia-routes-web-')
    const table = await tableOf('auth:\n  mode: none\nmcp:\n  enabled: true\n  token: t\n', {
      webRoot,
      asks: new AskDesk(),
      configPath: '/nonexistent/adestia.config.yaml',
      restart: () => undefined,
    })
    expect(table).toMatchSnapshot()
    expect(table.at(-1)).toBe('GET /*')
  })

  it('adds the sign-in routes in oidc mode', async () => {
    const table = await tableOf(`auth:
  mode: oidc
  oidc:
    issuer: https://auth.example
    clientId: adestia
    clientSecret: s3cret
    redirectUri: https://adestia.example/auth/callback
`)
    expect(table.filter((line) => line.includes('/auth/'))).toMatchSnapshot()
  })
})
