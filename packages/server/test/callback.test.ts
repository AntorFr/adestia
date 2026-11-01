import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { verifySettled, wakePrompt } from '../src/callback.js'
import { registerCallback } from '../src/routes/callback.js'
import type { McpServerConfig } from '../src/config.js'

const alfred: McpServerConfig = {
  name: 'alfred',
  url: 'https://alfred.example/mcp',
  headers: { authorization: 'Bearer alfred-token' },
}

/** A peer whose status tool answers what the test says. */
const statusAnswer = (text: string, ok = true) =>
  vi.fn(async () =>
    ok
      ? new Response(JSON.stringify({ result: { content: [{ type: 'text', text }] } }), {
          status: 200,
        })
      : new Response('', { status: 500 }),
  ) as unknown as typeof fetch

const build = async (
  servers: readonly McpServerConfig[] = [alfred],
  fetchImpl: typeof fetch = statusAnswer('done: voilà'),
) => {
  const app = Fastify()
  // The test owns the wake: `woke` resolves on the first call, so a test that
  // expects a wake awaits it rather than counting turns of the event loop.
  let wake!: () => void
  const woke = new Promise<void>((resolve) => {
    wake = resolve
  })
  const runTurn = vi.fn(async (_prompt: string) => {
    wake()
  })
  registerCallback(app, { servers: async () => servers, runTurn, fetchImpl })
  await app.ready()
  return { app, runTurn, woke }
}

/**
 * Proves a wake did NOT happen without waiting for time to pass: the handler
 * detaches its work and answers 202 before that work is done, so the test
 * sends one more knock that is certain to wake, and awaits that wake. The
 * detached chains start in order and take the same steps, so by the time the
 * sentinel wakes, the one under test has ended. The wake it did not make is
 * then the only thing missing from `runTurn`'s calls.
 */
const SENTINEL = 'job-sentinel'
const sentinelWakes = async (
  app: Awaited<ReturnType<typeof build>>['app'],
  woke: Promise<void>,
) => {
  expect((await knock(app, { from: 'alfred', job_id: SENTINEL })).statusCode).toBe(202)
  await woke
}

/** A peer that confirms only the sentinel's job, and says "no such job" to the rest. */
const confirmsSentinelOnly = () =>
  vi.fn(async (_url: unknown, init?: { body?: unknown }) =>
    String(init?.body).includes(SENTINEL)
      ? new Response(JSON.stringify({ result: { content: [{ type: 'text', text: 'done' }] } }))
      : new Response(
          JSON.stringify({ result: { content: [{ type: 'text', text: 'no such job — expired' }] } }),
        ),
  ) as unknown as typeof fetch

const knock = (app: Awaited<ReturnType<typeof build>>['app'], body: unknown) =>
  app.inject({ method: 'POST', url: '/callback', payload: body as Record<string, unknown> })

describe('the wake prompt', () => {
  it('is a template whose only variables are the two validated ids', () => {
    // Nothing the ping carried may reach the model raw: this is the whole
    // injection story of the weak door.
    const prompt = wakePrompt('alfred', 'job-0000042')
    expect(prompt).toContain('ask_alfred_status')
    expect(prompt).toContain('job-0000042')
    expect(prompt).toContain('Nobody is at a screen')
  })
})

describe('the verification', () => {
  it('asks the peer itself, with the peer’s own credentials', async () => {
    const fetchImpl = statusAnswer('here is your answer…')
    const settled = await verifySettled(alfred, 'alfred', 'job-0000001', fetchImpl)
    expect(settled).toBe(true)

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe('https://alfred.example/mcp')
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer alfred-token')
    const body = JSON.parse(init.body as string)
    expect(body.params).toEqual({ name: 'ask_alfred_status', arguments: { job_id: 'job-0000001' } })
  })

  it('says no for a job the peer never heard of, or one still running', async () => {
    expect(await verifySettled(alfred, 'alfred', 'j', statusAnswer('no such job — expired'))).toBe(
      false,
    )
    expect(
      await verifySettled(alfred, 'alfred', 'j', statusAnswer('still running (42s).')),
    ).toBe(false)
  })

  it('counts a FAILED job as settled — "it broke" is as actionable as "it finished"', async () => {
    expect(await verifySettled(alfred, 'alfred', 'j', statusAnswer('the CLI died'))).toBe(true)
  })

  it('stays silent on an unreachable peer or a stdio/OAuth one', async () => {
    const dead = vi.fn(async () => {
      throw new Error('unreachable')
    }) as unknown as typeof fetch
    expect(await verifySettled(alfred, 'alfred', 'j', dead)).toBe(false)

    const stdio: McpServerConfig = { name: 'local', command: 'x' }
    const minted: McpServerConfig = {
      ...alfred,
      auth: { tokenUrl: 'https://x/token', clientId: 'c' },
    }
    const never = vi.fn() as unknown as typeof fetch
    expect(await verifySettled(stdio, 'local', 'j', never)).toBe(false)
    expect(await verifySettled(minted, 'alfred', 'j', never)).toBe(false)
    expect(never).not.toHaveBeenCalled()
  })
})

describe('the door', () => {
  it('wakes the agent for a verified settlement, once', async () => {
    const { app, runTurn, woke } = await build()
    const first = await knock(app, { from: 'alfred', job_id: 'job-0000007' })
    expect(first.statusCode).toBe(202)
    await woke

    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(runTurn.mock.calls[0]![0]).toContain('ask_alfred_status')

    // The replay: same 202 — this door explains itself to nobody — no wake.
    // A duplicate schedules nothing, so the answer is the last step there is.
    const replay = await knock(app, { from: 'alfred', job_id: 'job-0000007' })
    expect(replay.statusCode).toBe(202)
    expect(runTurn).toHaveBeenCalledTimes(1)
    await app.close()
  })

  it('refuses a malformed knock before doing anything at all', async () => {
    const { app, runTurn } = await build()
    expect((await knock(app, { from: '../etc', job_id: 'job-0000001' })).statusCode).toBe(400)
    expect((await knock(app, { from: 'alfred', job_id: 'x y' })).statusCode).toBe(400)
    expect((await knock(app, { from: 'alfred' })).statusCode).toBe(400)
    // Broken JSON dies in the parser (400); a non-JSON content type dies in
    // content negotiation (415). Either way it never reaches the handler.
    const broken = await app.inject({
      method: 'POST',
      url: '/callback',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    })
    expect(broken.statusCode).toBe(400)
    // Every refusal above answered before anything was scheduled: nothing is left to wait for.
    expect(runTurn).not.toHaveBeenCalled()
    await app.close()
  })

  it('drops a ping from a name that is none of OUR peers', async () => {
    // The only settlements that mean anything are those of agents this
    // instance can ask; everything else is noise a 202 swallows.
    const fetchImpl = confirmsSentinelOnly()
    const { app, runTurn, woke } = await build([alfred], fetchImpl)
    expect((await knock(app, { from: 'mallory', job_id: 'job-0000001' })).statusCode).toBe(202)
    await sentinelWakes(app, woke)
    // The one poll that went out is the sentinel's: mallory bought none.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(runTurn.mock.calls[0]![0]).toContain(SENTINEL)
    await app.close()
  })

  it('drops a ping the peer does not confirm — a forged one buys a poll, nothing more', async () => {
    const { app, runTurn, woke } = await build([alfred], confirmsSentinelOnly())
    expect((await knock(app, { from: 'alfred', job_id: 'job-0000001' })).statusCode).toBe(202)
    await sentinelWakes(app, woke)
    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(runTurn.mock.calls[0]![0]).toContain(SENTINEL)
    await app.close()
  })
})
