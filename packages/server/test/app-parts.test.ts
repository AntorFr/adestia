/**
 * What left `app.ts` — the limiter, the headless turn, the delegation routes
 * and the `adestiaRunTurn` decoration — tested from the behaviour they had
 * before the move, not from their new shape.
 */
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { BackgroundReach } from '../src/background.js'
import { parseConfig, type McpServerConfig } from '../src/config.js'
import { DelegationChannel } from '../src/delegations.js'
import { registerDelegations } from '../src/routes/delegations.js'
import { TurnLimiter } from '../src/turn-limiter.js'
import { TurnCapacityError, TurnDesk } from '../src/turns.js'
import { makeRunUnattended } from '../src/unattended.js'
import { RESULT, ScriptedDriver, scriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

describe('the turn limiter', () => {
  it('refuses the acquisition past the cap and admits again after a release', () => {
    // Fails if the comparison `>=` becomes `>` (one turn too many) or release stops freeing.
    const limiter = new TurnLimiter(2)
    expect([limiter.tryAcquire(), limiter.tryAcquire(), limiter.tryAcquire()]).toEqual([
      true,
      true,
      false,
    ])
    expect(limiter.running).toBe(2)
    limiter.release()
    expect(limiter.running).toBe(1)
    expect(limiter.tryAcquire()).toBe(true)
  })

  it('never counts below zero on a stray release', () => {
    // Fails if the Math.max floor goes: a double release would mint a free slot.
    const limiter = new TurnLimiter(1)
    limiter.release()
    limiter.release()
    expect(limiter.running).toBe(0)
    expect([limiter.tryAcquire(), limiter.tryAcquire()]).toEqual([true, false])
  })

  it('admits nothing when the cap is zero', () => {
    expect(new TurnLimiter(0).tryAcquire()).toBe(false)
  })
})

function unattendedWith(
  driver: ConstructorParameters<typeof TurnDesk>[0],
  options: {
    max?: number
    servers?: () => Promise<readonly McpServerConfig[]>
    roots?: readonly string[]
  } = {},
) {
  const limiter = new TurnLimiter(options.max ?? 1)
  const desk = new TurnDesk(driver, limiter)
  const run = makeRunUnattended({
    desk,
    backgroundReach: new BackgroundReach(undefined),
    outboundServers: options.servers ?? (async () => []),
    cwd: '/work',
    agentRoots: options.roots ?? [],
  })
  return { run, limiter }
}

describe('the unattended turn', () => {
  it('runs a loose, unattended turn in the workspace and gives the slot back', async () => {
    // Fails if `unattended: true` or the cwd is dropped from the request, or the slot leaks.
    const driver = scriptedDriver(() => [{ type: 'text-delta', text: 'ok' }, RESULT])
    const { run, limiter } = unattendedWith(driver)

    await run('arrose')

    expect(driver.requests).toHaveLength(1)
    expect(driver.requests[0]!.prompt).toContain('arrose')
    expect(driver.requests[0]!.unattended).toBe(true)
    expect(driver.requests[0]!.cwd).toBe('/work')
    expect(limiter.running).toBe(0)
  })

  it('carries the agent roots only when there are some', async () => {
    const withRoots = scriptedDriver(() => [RESULT])
    await unattendedWith(withRoots, { roots: ['/memoire'] }).run('a')
    expect(withRoots.requests[0]!.roots).toEqual(['/memoire'])

    const without = scriptedDriver(() => [RESULT])
    await unattendedWith(without).run('a')
    expect('roots' in without.requests[0]!).toBe(false)
    expect('serverTokens' in without.requests[0]!).toBe(false)
  })

  it('refuses with TurnCapacityError when the house is full, before asking for any token', async () => {
    // Fails if admission moves after the token minting, or the cap stops applying to this path.
    const hold = new Promise<void>(() => {})
    const driver = new ScriptedDriver([RESULT], { hold })
    let asked = 0
    const { run, limiter } = unattendedWith(driver, {
      max: 1,
      servers: async () => {
        asked += 1
        return []
      },
    })

    void run('first')
    await driver.running
    await expect(run('second')).rejects.toBeInstanceOf(TurnCapacityError)
    expect(asked).toBe(1) // the first only: the refused one never reached the identity provider
    expect(limiter.running).toBe(1)
  })

  it('gives the reserved slot back when reading the servers throws', async () => {
    // Fails if the `admission.abort()` in the catch goes: the slot would leak forever.
    const driver = scriptedDriver(() => [RESULT])
    const { run, limiter } = unattendedWith(driver, {
      servers: async () => {
        throw new Error('config unreadable')
      },
    })

    await expect(run('a')).rejects.toThrow('config unreadable')
    expect(limiter.running).toBe(0)
    expect(driver.requests).toHaveLength(0)
  })

  it('throws the failure of a turn that failed', async () => {
    // Fails if the outcome's failure stops being rethrown: the clock would log success.
    const driver = scriptedDriver(() => {
      throw new Error('engine fell over')
    })
    const { run, limiter } = unattendedWith(driver)

    await expect(run('a')).rejects.toThrow(/engine fell over/)
    expect(limiter.running).toBe(0)
  })

  it('is the very function start() hands to the clock, exposed on the app', async () => {
    const driver = new ScriptedDriver([{ type: 'text-delta', text: 'hi' }, RESULT])
    const app = await buildApp({
      config: { ...parseConfig('auth:\n  mode: none\n'), dataDir: await tmpDir('adestia-parts-') },
      driver,
      plugins: [],
      pluginProblems: [],
    })

    expect(typeof app.adestiaRunTurn).toBe('function')
    await app.adestiaRunTurn('réveil')
    expect(driver.requests[0]!.prompt).toContain('réveil')
    expect(driver.requests[0]!.unattended).toBe(true)
  })

  it('shares the cap of the app: a full chat house refuses the clock', async () => {
    // Fails if buildApp gives the headless path a limiter of its own.
    const hold = new Promise<void>(() => {})
    const driver = new ScriptedDriver([RESULT], { hold })
    const app = await buildApp({
      config: {
        ...parseConfig('auth:\n  mode: none\n'),
        maxConcurrentTurns: 1,
        dataDir: await tmpDir('adestia-parts-'),
      },
      driver,
      plugins: [],
      pluginProblems: [],
    })

    void app.adestiaRunTurn('premier')
    await driver.running
    await expect(app.adestiaRunTurn('second')).rejects.toBeInstanceOf(TurnCapacityError)
  })
})

describe('the delegation routes', () => {
  async function mounted() {
    const dataDir = await tmpDir('adestia-deleg-routes-')
    const driver = scriptedDriver(() => [{ type: 'text-delta', text: 'fait.' }, RESULT])
    const channel = new DelegationChannel(new TurnDesk(driver, new TurnLimiter(3)), {
      dataDir,
      cwd: '/work',
    })
    const app = Fastify()
    registerDelegations(app, { channel })
    await app.ready()
    return { app, channel }
  }

  it('lists nothing on a fresh instance', async () => {
    const { app } = await mounted()
    const response = await app.inject({ method: 'GET', url: '/api/delegations' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delegations: [] })
  })

  it('lists a delegation and reads it back with its caller', async () => {
    const { app, channel } = await mounted()
    const opened = await channel.open('alfred', 'range les fiches', undefined)
    if ('unknown' in opened) throw new Error('expected a conversation')
    await channel.run('alfred', opened.conversationId, 'range les fiches')

    const list = (await app.inject({ method: 'GET', url: '/api/delegations' })).json()
    expect(list.delegations).toHaveLength(1)
    expect(list.delegations[0]).toMatchObject({
      caller: 'alfred',
      id: opened.conversationId,
      title: 'range les fiches',
    })

    const one = await app.inject({
      method: 'GET',
      url: `/api/delegations/alfred/${opened.conversationId}`,
    })
    expect(one.statusCode).toBe(200)
    const body = one.json()
    expect(body.caller).toBe('alfred')
    expect(body.messages.map((m: { text: string }) => m.text)).toEqual([
      'range les fiches',
      'fait.',
    ])
  })

  it('answers 404 "no such delegation" for an unknown id', async () => {
    const { app } = await mounted()
    const response = await app.inject({ method: 'GET', url: '/api/delegations/alfred/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'no such delegation' })
  })

  it('answers the same 404 for another caller’s conversation and for an unsafe caller segment', async () => {
    // Fails if the caller segment stops scoping the read (one agent reading another's
    // delegation) or an unsafe name starts to answer anything but the plain 404.
    const { app, channel } = await mounted()
    const opened = await channel.open('alfred', 'secret', undefined)
    if ('unknown' in opened) throw new Error('expected a conversation')

    const other = await app.inject({
      method: 'GET',
      url: `/api/delegations/bernard/${opened.conversationId}`,
    })
    expect(other.statusCode).toBe(404)
    expect(other.json()).toEqual({ error: 'no such delegation' })

    const unsafe = await app.inject({
      method: 'GET',
      url: `/api/delegations/Alfred.Bad/${opened.conversationId}`,
    })
    expect(unsafe.statusCode).toBe(404)
    expect(unsafe.json()).toEqual({ error: 'no such delegation' })
  })

  it('is mounted behind the identity gate in the real app', async () => {
    const driver = new ScriptedDriver([RESULT])
    const app = await buildApp({
      config: {
        ...parseConfig('auth:\n  mode: none\n'),
        dataDir: await tmpDir('adestia-parts-'),
      },
      driver,
      plugins: [],
      pluginProblems: [],
    })
    const response = await app.inject({ method: 'GET', url: '/api/delegations' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ delegations: [] })
  })
})
