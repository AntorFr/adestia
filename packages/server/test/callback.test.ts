import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerCallback, verifySettled, wakePrompt } from '../src/callback.js'
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
  const runTurn = vi.fn(async (_prompt: string) => {})
  registerCallback(app, { servers: async () => servers, runTurn, fetchImpl })
  await app.ready()
  return { app, runTurn }
}

const knock = (app: Awaited<ReturnType<typeof build>>['app'], body: unknown) =>
  app.inject({ method: 'POST', url: '/callback', payload: body as Record<string, unknown> })

const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

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
    const { app, runTurn } = await build()
    const first = await knock(app, { from: 'alfred', job_id: 'job-0000007' })
    expect(first.statusCode).toBe(202)
    await settle()

    expect(runTurn).toHaveBeenCalledTimes(1)
    expect(runTurn.mock.calls[0]![0]).toContain('ask_alfred_status')

    // The replay: same 202 — this door explains itself to nobody — no wake.
    await knock(app, { from: 'alfred', job_id: 'job-0000007' })
    await settle()
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
    await settle()
    expect(runTurn).not.toHaveBeenCalled()
    await app.close()
  })

  it('drops a ping from a name that is none of OUR peers', async () => {
    // The only settlements that mean anything are those of agents this
    // instance can ask; everything else is noise a 202 swallows.
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { app, runTurn } = await build([alfred], fetchImpl)
    expect((await knock(app, { from: 'mallory', job_id: 'job-0000001' })).statusCode).toBe(202)
    await settle()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(runTurn).not.toHaveBeenCalled()
    await app.close()
  })

  it('drops a ping the peer does not confirm — a forged one buys a poll, nothing more', async () => {
    const { app, runTurn } = await build([alfred], statusAnswer('no such job — it may have expired'))
    expect((await knock(app, { from: 'alfred', job_id: 'job-0000001' })).statusCode).toBe(202)
    await settle()
    expect(runTurn).not.toHaveBeenCalled()
    await app.close()
  })
})
