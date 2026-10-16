import { describe, expect, it } from 'vitest'

import { gated, inFlight } from '../src/io.js'

describe('the file-system gate', () => {
  it('never lets more than a fixed number of calls run at once, and runs them all', async () => {
    let peak = 0
    let release!: () => void
    const open = new Promise<void>((resolve) => { release = resolve })

    const calls = Array.from({ length: 200 }, (_, i) =>
      gated(async () => {
        peak = Math.max(peak, inFlight())
        await open
        return i
      }),
    )
    // Let the first wave reach the gate before letting anything finish.
    await Promise.resolve()
    expect(inFlight()).toBeLessThan(200)
    release()

    expect(await Promise.all(calls)).toEqual(Array.from({ length: 200 }, (_, i) => i))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(32)
    expect(inFlight()).toBe(0)
  })

  it('frees its place when a call fails, so one error does not stall the rest', async () => {
    const failing = Array.from({ length: 40 }, () =>
      gated(async () => { throw new Error('boom') }).catch(() => 'failed'),
    )
    expect(await Promise.all(failing)).toEqual(Array(40).fill('failed'))
    expect(await gated(async () => 'still served')).toBe('still served')
    expect(inFlight()).toBe(0)
  })
})
