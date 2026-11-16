/**
 * What the chat screens of packages/web/test/besoin-chat-browser.test.ts proved through a browser
 * and that the server does: a first message in a fresh conversation answers whole and in order,
 * and a question the engine asked is answered, once, through `/api/permission`. Each test goes
 * through the route (`app.inject`); the screen tests keep what is drawn. See
 * docs/tests-ecran/web-chat-charte.md.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { AskDesk, type AskAnswer, type Driver, type TurnRequest } from '@antorfr/adestia-drivers'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { driverWith } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

async function open(driver: Driver, asks?: AskDesk) {
  const dataDir = await tmpDir('adestia-chat-charte-hors-ecran-')
  const app = await buildApp({
    config: { ...parseConfig('auth:\n  mode: none\n'), dataDir },
    driver,
    plugins: [],
    pluginProblems: [],
    ...(asks ? { asks } : {}),
  })
  const create = async () => (await app.inject({ method: 'POST', url: '/api/conversations' })).json().id as string
  const read = async (id: string) => (await app.inject({ url: `/api/conversations/${id}` })).json()
  return { app, create, read }
}

describe('a first message in a fresh conversation, through the route', () => {
  it('files the message and the whole reply in the thread, in order', async () => {
    const driver = driverWith({
      async *runTurn(_request: TurnRequest) {
        yield { type: 'text-delta', text: 'bonjour ' }
        yield { type: 'text-delta', text: 'le monde' }
        yield { type: 'result', sessionId: 's1', stopped: false }
      },
    })
    const { app, create, read } = await open(driver)
    const id = await create()
    const sent = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'salut', conversationId: id } })
    expect(sent.statusCode).toBe(200)
    const thread = await read(id)
    expect(thread.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
      ['user', 'salut'],
      ['agent', 'bonjour le monde'],
    ])
  })
})

describe('answering a question the engine asked, through /api/permission', () => {
  const driver = driverWith()
  const ask = (desk: AskDesk, remembering = true) => {
    let id = ''
    const settled = desk.ask({ tool: 'Bash', title: 'Bash — rm -rf build', remembering }, (pending) => ((id = pending.id), true))
    return { id, settled }
  }
  const post = (app: Awaited<ReturnType<typeof open>>['app'], payload: unknown) =>
    app.inject({ method: 'POST', url: '/api/permission', payload: payload as object })

  it('hands the engine the answer the person gave, for each of the three', async () => {
    const desk = new AskDesk()
    const { app } = await open(driver, desk)
    for (const answer of ['deny', 'once', 'always'] as AskAnswer[]) {
      const { id, settled } = ask(desk)
      const response = await post(app, { id, answer })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ answered: true })
      expect(await settled).toBe(answer)
    }
    expect(desk.outstanding()).toHaveLength(0)
  })

  it('says 409 to a second answer: the question is no longer waiting', async () => {
    const desk = new AskDesk()
    const { app } = await open(driver, desk)
    const { id } = ask(desk)
    expect((await post(app, { id, answer: 'deny' })).statusCode).toBe(200)
    expect((await post(app, { id, answer: 'deny' })).statusCode).toBe(409)
  })

  it('refuses a body with no id or an answer that is none of the three, and leaves the question waiting', async () => {
    const desk = new AskDesk()
    const { app } = await open(driver, desk)
    const { id } = ask(desk)
    expect((await post(app, { answer: 'deny' })).statusCode).toBe(400)
    expect((await post(app, { id, answer: 'maybe' })).statusCode).toBe(400)
    expect(desk.outstanding().map((p) => p.id)).toEqual([id])
    desk.releaseAll()
  })
})
