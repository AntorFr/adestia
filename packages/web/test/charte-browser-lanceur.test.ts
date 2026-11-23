/**
 * The browser-test launcher draws its port then binds it: two launchers can draw the
 * same one and the loser exits on EADDRINUSE. `launch()` must retry that, and only that.
 * (Procedure test: no browser, no real launcher — the attempt is injected.)
 */
import { describe, expect, it } from 'vitest'

import { type Attempt, type Instance, LAUNCH_ATTEMPTS, launch } from './charte-browser'

const inUse = () => new Error('launcher exited (1): Error: listen EADDRINUSE 127.0.0.1:38509')
const instance = (url: string): Instance => ({ url, stop: async () => {} })

function script(...steps: Array<Error | Instance>): { attempt: Attempt; calls: Array<[string, string, string]> } {
  const calls: Array<[string, string, string]> = []
  const attempt: Attempt = async (seed, skin, locale) => {
    calls.push([seed, skin, locale])
    const step = steps[calls.length - 1]
    if (step === undefined) throw new Error('unexpected extra attempt')
    if (step instanceof Error) throw step
    return step
  }
  return { attempt, calls }
}

describe('launch() when two launchers fight for a port', () => {
  it('rend_l_instance_du_second_essai_apres_EADDRINUSE', async () => {
    const { attempt, calls } = script(inUse(), instance('http://127.0.0.1:1/'))
    const got = await launch('s', 'k', 'fr', attempt)
    expect(got.url).toBe('http://127.0.0.1:1/')
    expect(calls).toEqual([['s', 'k', 'fr'], ['s', 'k', 'fr']])
  })

  it('rejette_une_autre_erreur_sans_relance', async () => {
    const boom = new Error('launcher exited (1): Error: build missing')
    const { attempt, calls } = script(boom, instance('http://x/'))
    await expect(launch('s', '', 'en', attempt)).rejects.toBe(boom)
    expect(calls).toHaveLength(1)
  })

  it('abandonne_apres_trois_essais_en_tout_avec_le_message_du_dernier', async () => {
    expect(LAUNCH_ATTEMPTS).toBe(3)
    const last = new Error('launcher exited (1): listen EADDRINUSE 127.0.0.1:3')
    const { attempt, calls } = script(inUse(), inUse(), last, instance('http://x/'))
    await expect(launch('s', '', 'en', attempt)).rejects.toBe(last)
    expect(calls).toHaveLength(3)
  })

  it('reussit_au_troisieme_essai', async () => {
    const { attempt, calls } = script(inUse(), inUse(), instance('http://127.0.0.1:3/'))
    expect((await launch('s', '', 'en', attempt)).url).toBe('http://127.0.0.1:3/')
    expect(calls).toHaveLength(3)
  })

  it('une_autre_erreur_apres_un_EADDRINUSE_est_rejetee_aussitot', async () => {
    const other = new Error('launcher exited (2): boom')
    const { attempt, calls } = script(inUse(), other, instance('http://x/'))
    await expect(launch('s', '', 'en', attempt)).rejects.toBe(other)
    expect(calls).toHaveLength(2)
  })

  it('un_succes_du_premier_essai_ne_relance_rien', async () => {
    const { attempt, calls } = script(instance('http://127.0.0.1:9/'), inUse())
    expect((await launch('s', '', 'en', attempt)).url).toBe('http://127.0.0.1:9/')
    expect(calls).toHaveLength(1)
  })
})
