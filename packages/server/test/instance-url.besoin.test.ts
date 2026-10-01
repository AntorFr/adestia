/**
 * Ensemble tests for feature `adestia-instance-url`, written from the feature's
 * own conception (fonctionnelle.md + technique.md, since this feature has no
 * screen) — independently of the diff that implemented it.
 *
 * Entry point: the operator's config file, boot (`start()`), and the
 * `this-instance` contract delivered to disk for the agent's CLI to read —
 * the real path from a YAML file to the file a driver actually opens, with no
 * mocked internals besides the driver process itself (never spawned here).
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/adestia-drivers'

import { start, type StartedInstance } from '../src/start.js'

/** A driver that answers, spawns nothing, and tells `start()` where a CLI
 *  would read its contracts — the detail that makes delivery to disk happen. */
class ContractReadingDriver implements Driver {
  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({ id: 'stub', label: 'Stub', cliVersion: '0', capabilities: [] })
  }
  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }
  async *runTurn(): AsyncIterable<TurnEvent> {
    return
  }
  interrupt(): Promise<void> {
    return Promise.resolve()
  }
  skillsPath(): string {
    return '.claude/skills'
  }
}

let root: string
let started: StartedInstance | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-instance-url-besoin-'))
})

afterEach(async () => {
  await started?.close()
  started = undefined
})

/** Port 0: the OS picks a free one, so parallel test files never collide. */
const boot = async (config: string, driverFactory: () => Driver = () => new ContractReadingDriver()) => {
  await writeFile(join(root, 'adestia.config.yaml'), `${config}\nport: 0\nworkspace:\n  root: ./ws\n`)
  started = await start({ cwd: root, configPath: 'adestia.config.yaml', driverFactory, log: () => undefined })
  return started
}

const contractPath = join('ws', '.claude', 'skills', 'this-instance', 'SKILL.md')
const readContract = async () => readFile(join(root, contractPath), 'utf8')

describe('B-1 — nominal : l’opérateur a renseigné l’adresse publique', () => {
  it('porte l’adresse déclarée dans le contrat this-instance, verbatim', async () => {
    // fonctionnelle.md : « l'agent la connaît et peut la donner à qui la lui
    // demande ». technique.md fige la phrase ajoutée au contrat.
    await boot('url: https://atelier.example')
    const contract = await readContract()
    expect(contract).toContain('It answers at `https://atelier.example`.')
  })
})

describe('B-2 — bord : aucune régression quand l’adresse n’est pas renseignée', () => {
  it('ne mentionne aucune adresse et continue de renvoyer vers Réglages/opérateur', async () => {
    // fonctionnelle.md : « Rien ne change quand elle ne l'a pas été : l'agent
    // reste sur la réponse actuelle (renvoyer vers l'écran Réglages ou
    // l'opérateur du déploiement) ».
    await boot('name: Atelier')
    const contract = await readContract()
    expect(contract).not.toContain('It answers at')
    expect(contract).toMatch(/Settings screen/)
    expect(contract).toMatch(/whoever runs\s+the deployment/)
  })
})

describe('B-3 — bord : une adresse avec un chemin de montage et un slash final', () => {
  it('garde le chemin et retire le slash final, pour un affichage stable', async () => {
    // technique.md : « un chemin est autorisé … normalisée en retirant un `/`
    // final, pour un affichage stable. »
    await boot('url: https://host.example/adestia/')
    const contract = await readContract()
    expect(contract).toContain('It answers at `https://host.example/adestia`.')
  })
})

describe('B-4 — échec : une adresse qui ne respecte pas le contrat déclaré', () => {
  it('refuse un protocole autre que http/https, et ne démarre pas à moitié configuré', async () => {
    // technique.md : « doit parser avec new URL(value) ; protocole http:/https:
    // uniquement. »
    await writeFile(
      join(root, 'ftp.yaml'),
      'url: ftp://atelier.example\nport: 0\nworkspace:\n  root: ./ws\n',
    )
    await expect(
      start({ cwd: root, configPath: 'ftp.yaml', driverFactory: () => new ContractReadingDriver() }),
    ).rejects.toThrow(/url must be http or https/)
  })

  it('refuse une adresse qui porte une query', async () => {
    // technique.md : « pas de query ni de fragment … » — « leur présence
    // sentirait une URL copiée-collée … plutôt qu'une adresse d'instance. »
    await writeFile(
      join(root, 'query.yaml'),
      'url: "https://atelier.example/?debug=1"\nport: 0\nworkspace:\n  root: ./ws\n',
    )
    await expect(
      start({ cwd: root, configPath: 'query.yaml', driverFactory: () => new ContractReadingDriver() }),
    ).rejects.toThrow(/must not carry a query or a fragment/)
  })

  it('refuse une adresse qui porte un fragment', async () => {
    await writeFile(
      join(root, 'fragment.yaml'),
      'url: "https://atelier.example/#section"\nport: 0\nworkspace:\n  root: ./ws\n',
    )
    await expect(
      start({ cwd: root, configPath: 'fragment.yaml', driverFactory: () => new ContractReadingDriver() }),
    ).rejects.toThrow(/must not carry a query or a fragment/)
  })

  it('refuse une chaîne qui n’est pas une URL', async () => {
    await writeFile(
      join(root, 'malformed.yaml'),
      'url: "pas une url"\nport: 0\nworkspace:\n  root: ./ws\n',
    )
    await expect(
      start({ cwd: root, configPath: 'malformed.yaml', driverFactory: () => new ContractReadingDriver() }),
    ).rejects.toThrow(/is not a valid URL/)
  })
})

describe('B-5 — exclusion : l’agent ne déduit jamais l’adresse lui-même', () => {
  it('ne tire aucune adresse de host/port, même quand ils sont renseignés', async () => {
    // fonctionnelle.md : « L'agent ne déduit jamais cette adresse par
    // lui-même (pas de détection réseau, pas de lecture d'un en-tête de
    // requête au démarrage) ». host/port existent déjà comme réglages de bind
    // interne — leur présence ne doit rien faire fuiter dans le contrat.
    await boot('host: 0.0.0.0')
    const contract = await readContract()
    expect(contract).not.toContain('It answers at')
    expect(contract).not.toContain('0.0.0.0')
  })
})

describe('B-6 — exclusion : l’écran Réglages n’expose pas ce réglage', () => {
  it('n’apparaît pas parmi les réglages lus par /api/settings, même configuré', async () => {
    // fonctionnelle.md : « L'écran Réglages (Configuration.tsx) n'est pas
    // touché. Tranché par Monsieur le 2026-10-01 … comme name et locale
    // aujourd'hui. »
    const instance = await boot('url: https://atelier.example')
    const response = await instance.app.inject({ url: '/api/settings' })
    const body = JSON.parse(response.body) as { values: ReadonlyArray<{ path: readonly string[] }> }
    expect(body.values.some((value) => value.path[0] === 'url')).toBe(false)
    expect(response.body).not.toContain('atelier.example')
  })
})
