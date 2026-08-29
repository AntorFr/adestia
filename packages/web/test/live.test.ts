/**
 * The change-feed follower.
 *
 * What matters: events reach `onChange`, a refusal stops the loop for good,
 * and a dropped connection costs a delay rather than the feature.
 */

import { describe, expect, it } from 'vitest'

import { followChanges } from '../src/app/live.js'

function sseResponse(
  frames: readonly string[],
  options: { hang?: boolean } = {},
): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      if (!options.hang) controller.close()
    },
  })
  return { ok: true, status: 200, body } as unknown as Response
}

const CHANGED = 'event: pages-changed\ndata: {"type":"pages-changed","paths":["a.md"]}\n\n'

describe('followChanges', () => {
  it('hands each batch to onChange', async () => {
    const controller = new AbortController()
    const batches: (readonly string[])[] = []
    const fetchImpl = (() => Promise.resolve(sseResponse([': connected\n\n', CHANGED]))) as unknown as typeof fetch

    const following = followChanges({
      fetchImpl,
      signal: controller.signal,
      retryMs: 1,
      onChange: (paths) => {
        batches.push(paths)
        controller.abort()
      },
    })
    await following
    expect(batches[0]).toEqual(['a.md'])
  })

  it('stops for good when the feed is not offered', async () => {
    let calls = 0
    const fetchImpl = (() => {
      calls += 1
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response)
    }) as unknown as typeof fetch

    await followChanges({
      fetchImpl,
      signal: new AbortController().signal,
      retryMs: 1,
      onChange: () => undefined,
    })
    // One ask, one no, no hammering.
    expect(calls).toBe(1)
  })

  it('reconnects after the stream ends, and asks for a resync', async () => {
    const controller = new AbortController()
    let calls = 0
    const batches: (readonly string[])[] = []
    const fetchImpl = (() => {
      calls += 1
      // First connection delivers one batch then dies; the second hangs open.
      return Promise.resolve(
        calls === 1 ? sseResponse([CHANGED]) : sseResponse([], { hang: true }),
      )
    }) as unknown as typeof fetch

    const following = followChanges({
      fetchImpl,
      signal: controller.signal,
      retryMs: 1,
      onChange: (paths) => {
        batches.push(paths)
        // The resync after the gap is the second call; the follower has done
        // its whole dance by then.
        if (batches.length === 2) controller.abort()
      },
    })
    await following
    expect(calls).toBe(2)
    expect(batches).toEqual([['a.md'], []])
  })

  it('ends promptly when the shell unsubscribes', async () => {
    const controller = new AbortController()
    const fetchImpl = (() => Promise.resolve(sseResponse([], { hang: true }))) as unknown as typeof fetch
    const following = followChanges({
      fetchImpl,
      signal: controller.signal,
      retryMs: 1,
      onChange: () => undefined,
    })
    controller.abort()
    await expect(
      Promise.race([
        following,
        new Promise((_, reject) => setTimeout(() => reject(new Error('still following')), 1000)),
      ]),
    ).resolves.toBeUndefined()
  })
})
