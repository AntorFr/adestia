/**
 * What the chat screens of bench/tests/chat-*.test.mjs used to prove through a browser and that
 * the server does: the turn limit, the held message, the stop, the archive. Each test goes
 * through the route (`app.inject`) with a scripted engine; the screen tests keep what is drawn.
 * See docs/tests-ecran/bench-chat.md.
 */
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import type { Driver, TurnEvent, TurnRequest } from '@antorfr/adestia-drivers'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { driverWith } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

/** Resolves when the turn is told to stop: the driver's half of the bargain. */
const told = (signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    if (!signal) return
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })

const done: TurnEvent = { type: 'result', sessionId: 's1', stopped: false }

/**
 * An engine whose turns hold until stopped, except the prompts named in `answers`,
 * which answer at once. `started` says, by signal, that a prompt has been pulled.
 */
function engine(answers: readonly string[] = []) {
  const prompts: string[] = []
  const waiters = new Map<string, () => void>()
  const started = (prompt: string) => new Promise<void>((resolve) => waiters.set(prompt, resolve))
  const driver: Driver = driverWith({
    async *runTurn(request: TurnRequest) {
      prompts.push(request.prompt)
      waiters.get(request.prompt)?.()
      if (answers.includes(request.prompt)) {
        yield { type: 'text-delta', text: `réponse à ${request.prompt}` }
        yield done
        return
      }
      await told(request.signal)
      yield { type: 'result', sessionId: 's1', stopped: true }
    },
  })
  return { driver, prompts, started }
}

async function open(driver: Driver, limit: number) {
  const dataDir = await tmpDir('adestia-chat-hors-ecran-')
  const app = await buildApp({
    config: { ...parseConfig(`auth:\n  mode: none\nmaxConcurrentTurns: ${limit}\n`), dataDir },
    driver,
    plugins: [],
    pluginProblems: [],
  })
  const create = async () => (await app.inject({ method: 'POST', url: '/api/conversations' })).json().id as string
  const turn = (prompt: string, conversationId: string) =>
    app.inject({ method: 'POST', url: '/api/turn', payload: { prompt, conversationId } })
  const stop = (conversation: string) => app.inject({ method: 'POST', url: '/api/turn/stop', payload: { conversation } })
  const read = async (id: string) => (await app.inject({ url: `/api/conversations/${id}` })).json()
  return { app, create, turn, stop, read }
}

describe('a turn past maxConcurrentTurns, through the route', () => {
  it('answers 429 naming the limit, files nothing, and accepts the next send once a seat is free', async () => {
    const { driver, started } = engine(['libre'])
    const { create, turn, stop, read } = await open(driver, 1)
    const [busy, refused] = [await create(), await create()]

    const running = started('occupé')
    const first = turn('occupé', busy)
    await running

    const response = await turn('fini', refused)
    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({ error: 'too many turns running', max: 1 })
    expect((await read(refused)).messages).toEqual([])

    // free the seat from its own conversation, then send again: accepted and answered
    expect((await stop(busy)).json()).toEqual({ stopped: true })
    await first
    const accepted = await turn('libre', refused)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.body).toContain('réponse à libre')
  })

  it('names the server’s limit, not a constant: with 2 the answer says 2', async () => {
    const { driver, started } = engine()
    const { create, turn, stop } = await open(driver, 2)
    const [a, b, c] = [await create(), await create(), await create()]
    const [runningA, runningB] = [started('a'), started('b')]
    const firstA = turn('a', a)
    const firstB = turn('b', b)
    await Promise.all([runningA, runningB])

    const response = await turn('c', c)
    expect(response.statusCode).toBe(429)
    expect(response.json().max).toBe(2)

    await stop(a)
    await stop(b)
    await Promise.all([firstA, firstB])
  })

  it('refuses a body with no prompt with its own text, not the limit’s', async () => {
    const { driver } = engine()
    const { app, create } = await open(driver, 1)
    const id = await create()
    const response = await app.inject({ method: 'POST', url: '/api/turn', payload: { conversationId: id } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'prompt is required' })
  })
})

describe('a second message while a turn runs, through the route', () => {
  it('is held (202), filed in the thread at once, and run after a stop', async () => {
    const { driver, prompts, started } = engine(['deuxieme message'])
    const { create, turn, stop, read } = await open(driver, 3)
    const id = await create()

    const running = started('en cours')
    const first = turn('en cours', id)
    await running

    const held = await turn('deuxieme message', id)
    expect(held.statusCode).toBe(202)
    expect(held.json()).toEqual({ held: true })
    // filed before the browser hears anything back: it survives a reload
    expect((await read(id)).messages.map((m: { role: string; text: string }) => [m.role, m.text])).toContainEqual(['user', 'deuxieme message'])

    expect((await stop(id)).statusCode).toBe(200)
    await first
    await expect.poll(async () => (await read(id)).messages.some((m: { role: string; text: string }) => m.role === 'agent' && m.text === 'réponse à deuxieme message')).toBe(true)
    expect(prompts).toEqual(['en cours', 'deuxieme message'])
  })

  it('answers 409 to a stop when nothing runs there', async () => {
    const { driver } = engine()
    const { create, stop } = await open(driver, 1)
    expect((await stop(await create())).statusCode).toBe(409)
  })
})

describe('archiving, through the route', () => {
  it('takes the conversation out of the list and keeps it readable', async () => {
    const { driver } = engine()
    const { app, create, read } = await open(driver, 1)
    const id = await create()
    const listed = async () => ((await app.inject({ url: '/api/conversations' })).json().conversations as { id: string }[]).map((c) => c.id)
    expect(await listed()).toContain(id)

    const archived = await app.inject({ method: 'POST', url: `/api/conversations/${id}/archive` })
    expect(archived.json()).toEqual({ id, archived: true })
    expect(await listed()).not.toContain(id)
    expect((await read(id)).archived).toBe(true)
  })
})

describe('the length of the chat functions, through bench/long-functions.mjs', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const tool = (...targets: string[]) => spawnSync('node', ['bench/long-functions.mjs', ...targets], { cwd: root, encoding: 'utf8' })

  it('refuses a 300-line function (control: the tool can say no)', async () => {
    const dir = await tmpDir('adestia-long-fn-')
    const body = Array.from({ length: 300 }, (_, i) => `  const v${i} = ${i}`).join('\n')
    await writeFile(join(dir, 'Long.tsx'), `export function Long() {\n${body}\n  return 1\n}\n`)
    const out = tool(dir)
    expect(out.status, out.stdout + out.stderr).toBe(1)
    expect(out.stdout).toMatch(/Long/)
  })

  it('finds no function over 250 lines in Chat, useConversations and Composer', () => {
    const out = tool('packages/web/src/chat/Chat.tsx', 'packages/web/src/chat/useConversations.ts', 'packages/web/src/chat/Composer.tsx')
    expect(out.status, out.stdout + out.stderr).toBe(0)
    expect(out.stdout.trim()).toBe('')
  })
})
