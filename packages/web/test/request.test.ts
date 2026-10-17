import { describe, expect, it } from 'vitest'

import { FALLBACK_KEY, jsonInit, requestJson } from '../src/app/request.js'

const reply = (body: string | null, status = 200) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch

const said = (key: string) => (key === FALLBACK_KEY ? 'échec (%n)' : key)

describe('requestJson', () => {
  it('returns the parsed JSON body of a success', async () => {
    const result = await requestJson<{ a: number }>(reply('{"a":1}'), '/x')
    expect(result).toEqual({ ok: true, status: 200, data: { a: 1 } })
  })

  it('accepts an empty body on success without throwing', async () => {
    const result = await requestJson(reply(null, 204), '/x')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(204)
    expect((result as { data: unknown }).data).toBeUndefined()
  })

  it('carries the server error of a refusal', async () => {
    const result = await requestJson(reply('{"error":"nope"}', 409), '/x', undefined, said)
    expect(result).toEqual({ ok: false, status: 409, error: 'nope', data: { error: 'nope' } })
  })

  it('keeps the parsed body of a refusal, for one that carries figures', async () => {
    const result = await requestJson(reply('{"running":2}', 409), '/x', undefined, said)
    expect((result as { data: unknown }).data).toEqual({ running: 2 })
  })

  it('falls back to a sentence in the locale when the refusal has no error', async () => {
    for (const body of ['{}', '', 'not json', '{"error":""}', '{"error":3}', 'null']) {
      const result = await requestJson(reply(body, 500), '/x', undefined, said)
      expect(result).toMatchObject({ ok: false, status: 500, error: 'échec (500)' })
    }
  })

  it('turns a network error into status 0 and never throws', async () => {
    const boom = (async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    expect(await requestJson(boom, '/x')).toEqual({ ok: false, status: 0, error: 'offline' })
    const silent = (async () => {
      throw new Error('')
    }) as unknown as typeof fetch
    expect(await requestJson(silent, '/x', undefined, said)).toEqual({
      ok: false,
      status: 0,
      error: 'échec (0)',
    })
    const odd = (async () => {
      throw 'string'
    }) as unknown as typeof fetch
    expect((await requestJson(odd, '/x', undefined, said)).ok).toBe(false)
  })

  it('passes path and init to the injected fetch', async () => {
    const seen: unknown[] = []
    const spy = (async (...args: unknown[]) => {
      seen.push(...args)
      return new Response('{}')
    }) as unknown as typeof fetch
    const init = jsonInit('POST', { a: 1 })
    await requestJson(spy, '/p', init)
    expect(seen).toEqual(['/p', init])
  })
})

describe('jsonInit', () => {
  it('serialises a body with a JSON content-type', () => {
    expect(jsonInit('POST', { a: 1 })).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    })
  })
  it('sends no content-type without a body', () => {
    expect(jsonInit('DELETE')).toEqual({ method: 'DELETE' })
  })
})
