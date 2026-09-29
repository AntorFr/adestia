/**
 * The background reach.
 *
 * Two properties carry the whole design: only the flagged servers ever get a
 * token, and a reach that fails is SAID — held as trouble for the shell,
 * logged for the operator — instead of quietly reading nothing.
 */

import { describe, expect, it, vi } from 'vitest'

import { BackgroundReach } from '../src/background.js'
import type { McpServerConfig } from '../src/config.js'

const GOOGLE: McpServerConfig = {
  name: 'google',
  url: 'https://hub.example/google/',
  identity: 'user',
  background: true,
}
const WITHINGS: McpServerConfig = {
  name: 'withings',
  url: 'https://hub.example/withings/',
  identity: 'user',
}
const MAPS: McpServerConfig = { name: 'maps', url: 'https://hub.example/maps/' }

const keysOf = (subjects: string[], token?: string) => ({
  subjects: () => Promise.resolve(subjects),
  accessToken: () => Promise.resolve(token),
})

describe('what a caller-less turn is handed', () => {
  it('mints for the flagged servers, and for them alone', async () => {
    const reach = new BackgroundReach(keysOf(['sebastien'], 'jeton-de-fond'))
    const tokens = await reach.tokensFor([GOOGLE, WITHINGS, MAPS])
    // The unflagged user server stays invisible in the background; the
    // machine server never needed anything from here.
    expect(tokens).toEqual({ google: 'jeton-de-fond' })
    expect(reach.trouble()).toBeUndefined()
  })

  it('hands nothing, and stays silent, when nothing is flagged', async () => {
    const log = vi.fn()
    const reach = new BackgroundReach(keysOf([], undefined), log)
    expect(await reach.tokensFor([WITHINGS, MAPS])).toEqual({})
    // Not even a trouble: there is no granted reach to have lost.
    expect(reach.trouble()).toBeUndefined()
    expect(log).not.toHaveBeenCalled()
  })
})

describe('a reach that fails is said, never silent', () => {
  it('says when the deployment keeps no user keys at all', async () => {
    const log = vi.fn()
    const reach = new BackgroundReach(undefined, log)
    expect(await reach.tokensFor([GOOGLE])).toEqual({})
    expect(reach.trouble()).toMatchObject({ code: 'no-rebound', servers: ['google'] })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no-rebound'))
  })

  it('says when nobody has signed in yet', async () => {
    const reach = new BackgroundReach(keysOf([]))
    await reach.tokensFor([GOOGLE])
    expect(reach.trouble()).toMatchObject({ code: 'nobody-connected' })
  })

  it('refuses loudly to choose between two people', async () => {
    // THE arbitration: never a guess, never a config'd subject — see the
    // module doc for why a `sub` written into a file would lie one day.
    const reach = new BackgroundReach(keysOf(['sebastien', 'invitee'], 'jeton'))
    expect(await reach.tokensFor([GOOGLE])).toEqual({})
    expect(reach.trouble()).toMatchObject({ code: 'several-people' })
  })

  it('says when the one key stopped minting', async () => {
    const log = vi.fn()
    const reach = new BackgroundReach(keysOf(['sebastien'], undefined), log)
    expect(await reach.tokensFor([GOOGLE])).toEqual({})
    expect(reach.trouble()).toMatchObject({ code: 'mint-failed', servers: ['google'] })
    // Every failing turn logs — each entry is a turn that ran without its
    // reach, and the journal should count them all.
    await reach.tokensFor([GOOGLE])
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('dates the trouble from its FIRST occurrence, not the last tick', async () => {
    const reach = new BackgroundReach(keysOf(['sebastien'], undefined))
    await reach.tokensFor([GOOGLE])
    const first = reach.trouble()!.since
    await new Promise((resolve) => setTimeout(resolve, 5))
    await reach.tokensFor([GOOGLE])
    expect(reach.trouble()!.since).toBe(first)
  })

  it('clears the banner the moment the reach works again', async () => {
    let token: string | undefined = undefined
    const reach = new BackgroundReach({
      subjects: () => Promise.resolve(['sebastien']),
      accessToken: () => Promise.resolve(token),
    })
    await reach.tokensFor([GOOGLE])
    expect(reach.trouble()).toBeDefined()
    token = 'jeton-revenu'
    expect(await reach.tokensFor([GOOGLE])).toEqual({ google: 'jeton-revenu' })
    expect(reach.trouble()).toBeUndefined()
  })

  it('takes the banner down when the flag leaves the config', async () => {
    const reach = new BackgroundReach(keysOf([], undefined))
    await reach.tokensFor([GOOGLE])
    expect(reach.trouble()).toBeDefined()
    // The operator unflagged the server: a banner for a reach nobody grants
    // any more would send someone hunting a problem that no longer exists.
    await reach.tokensFor([WITHINGS])
    expect(reach.trouble()).toBeUndefined()
  })
})
