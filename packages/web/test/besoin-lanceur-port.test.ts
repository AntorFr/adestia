/**
 * Need (fiche rouge-adestia-20): `launch()` of charte-browser.ts relaunches the launcher
 * (new port drawn) up to three tries in all when it exits failing with EADDRINUSE on its
 * stderr; any other failing exit is rejected at once with the current message
 * `launcher exited (<code>): <stderr tail>`. Here the REAL spawnLauncher runs, over real child
 * processes: `child_process.spawn` is redirected so that the launcher script is replaced by a
 * scripted `node -e` (same execPath, same pipes), never a mocked child.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const plan: { scripts: string[]; calls: number } = vi.hoisted(() => ({ scripts: [], calls: 0 }))

vi.mock('node:child_process', async (orig) => {
  const mod = await orig<typeof import('node:child_process')>()
  return {
    ...mod,
    spawn: (cmd: string, _args: string[], opts: object) => {
      const script = plan.scripts[plan.calls++] ?? 'process.stderr.write("unexpected extra launch");process.exit(9)'
      return mod.spawn(cmd, ['-e', script], opts as never)
    },
  }
})

import { launch } from './charte-browser'

const EADDR = 'process.stderr.write("Error: listen EADDRINUSE 127.0.0.1:38509\\n");process.exit(1)'
const up = (port: number) => `console.log("listening on http://127.0.0.1:${port}/");setInterval(()=>{},1000)`

beforeEach(() => {
  plan.scripts = []
  plan.calls = 0
})

describe('launch() with the real launcher process (rouge nouveau-modele-browser, EADDRINUSE)', () => {
  it('relance_apres_un_lanceur_sorti_en_EADDRINUSE_et_rend_le_second', async () => {
    plan.scripts = [EADDR, up(4001)]
    const got = await launch('s', '', 'fr')
    expect(got.url).toBe('http://127.0.0.1:4001/')
    expect(plan.calls).toBe(2)
    await got.stop()
  })

  it('relance_meme_quand_la_sortie_est_immediate_sur_dix_collisions_de_suite', async () => {
    for (let i = 0; i < 10; i++) {
      plan.scripts = [EADDR, up(4100 + i)]
      plan.calls = 0
      const got = await launch('s', '', 'fr')
      expect(got.url).toBe(`http://127.0.0.1:${4100 + i}/`)
      await got.stop()
    }
  })

  it('reussit_au_troisieme_essai_apres_deux_EADDRINUSE', async () => {
    plan.scripts = [EADDR, EADDR, up(4002)]
    const got = await launch('s', '', 'fr')
    expect(got.url).toBe('http://127.0.0.1:4002/')
    expect(plan.calls).toBe(3)
    await got.stop()
  })

  it('abandonne_apres_exactement_trois_lanceurs_en_EADDRINUSE', async () => {
    plan.scripts = [EADDR, EADDR, EADDR, up(4003)]
    await expect(launch('s', '', 'fr')).rejects.toThrow(/^launcher exited \(1\): .*EADDRINUSE 127\.0\.0\.1:38509/s)
    expect(plan.calls).toBe(3)
  })

  it('rejette_une_autre_erreur_aussitot_avec_le_message_actuel', async () => {
    plan.scripts = ['process.stderr.write("build missing");process.exit(2)', up(4004)]
    await expect(launch('s', '', 'fr')).rejects.toThrow('launcher exited (2): build missing')
    expect(plan.calls).toBe(1)
  })

  it('un_lanceur_qui_demarre_du_premier_coup_nest_pas_relance', async () => {
    plan.scripts = [up(4005), EADDR]
    const got = await launch('s', '', 'fr')
    expect(got.url).toBe('http://127.0.0.1:4005/')
    expect(plan.calls).toBe(1)
    await got.stop()
  })
})
