/**
 * Ensemble test for feature `adestia-instance-url`, written from its own
 * conception — `features/adestia-instance-url/fonctionnelle.md`, and, since
 * this feature has no screen, `technique.md`'s contracts (the config field,
 * its validation, and the `this-instance` contract) as the only point of
 * entry — never from the diff that implemented it.
 *
 * Driven through the real boot path: a YAML file on disk, the real
 * `parseConfig`, a real listening Fastify instance, and — for the contract
 * itself — the real `claude-code` driver `start()` builds by default (the
 * same one the CLI and the Docker image build). The only thing never spawned
 * is the agent CLI subprocess, because no test here runs a turn.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { start, type StartedInstance } from '../src/start.js'

let root: string
let started: StartedInstance | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-instance-url-'))
})

afterEach(async () => {
  await started?.close()
  started = undefined
})

/**
 * Boots the real instance from a config an operator could have written.
 * `port: 0` so this suite never fights another for a socket; `workspace.root`
 * pinned to a name under the temp dir so the contract's path is predictable.
 */
async function boot(config: string): Promise<StartedInstance> {
  await writeFile(join(root, 'adestia.config.yaml'), `workspace:\n  root: ./ws\nport: 0\n${config}`)
  started = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
  return started
}

/** Rejects boot from a bad config, same file, so the error path shares the setup. */
async function bootRejecting(config: string): Promise<Error> {
  await writeFile(join(root, 'adestia.config.yaml'), `workspace:\n  root: ./ws\nport: 0\n${config}`)
  try {
    started = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
    throw new Error('expected start() to reject, it resolved instead')
  } catch (error) {
    return error as Error
  }
}

/** Where the default (claude-code) driver reads the contract from, on disk. */
const readContract = () => readFile(join(root, 'ws', '.claude', 'skills', 'this-instance', 'SKILL.md'), 'utf8')

describe('B-1 — the operator declares the address, the agent can state it', () => {
  it('states the declared address, verbatim, in the this-instance contract', async () => {
    // "l'agent la connaît et peut la donner à qui la lui demande" — the
    // declared address must be findable, as the operator typed its origin,
    // in the material the agent actually reads.
    await boot('url: https://chronique.example.org\n')
    const contract = await readContract()
    expect(contract).toContain('It answers at `https://chronique.example.org`.')
  })

  it('keeps a declared path, normalising only a trailing slash', async () => {
    // technique.md: a path under an ingress prefix is allowed; a trailing
    // slash is stripped "pour un affichage stable" — tranché le 2026-10-01.
    await boot('url: https://chronique.example.org/jeux/\n')
    const contract = await readContract()
    expect(contract).toContain('It answers at `https://chronique.example.org/jeux`.')
  })
})

describe('B-2 — bords: nothing was declared, nothing changes', () => {
  it('adds no address, and keeps pointing to Settings or the operator', async () => {
    // "Rien ne change quand elle ne l'a pas été: l'agent reste sur la réponse
    // actuelle (renvoyer vers l'écran Réglages ou l'opérateur du déploiement)."
    await boot('name: Chronique\n')
    const contract = await readContract()
    expect(contract).not.toContain('It answers at')
    expect(contract).toMatch(/Settings screen/)
    expect(contract).toMatch(/whoever runs\s+the deployment/)
  })
})

describe('B-3 — exclusion: the agent never deduces the address by itself', () => {
  it('does not fall back to the bind host/port when no address was declared', async () => {
    // "L'agent ne déduit jamais cette adresse par lui-même (pas de détection
    // réseau, pas de lecture d'un en-tête de requête au démarrage)." A host
    // bound wide open must not leak into the contract as a guessed address.
    await boot('host: 0.0.0.0\n')
    const contract = await readContract()
    expect(contract).not.toContain('It answers at')
    expect(contract).not.toContain('0.0.0.0')
  })

  it('does not expose the setting on the Settings screen — fichier seul, like name/locale', async () => {
    // "L'écran Réglages (Configuration.tsx) n'est pas touché … comme name et
    // locale aujourd'hui." /api/settings is what that screen reads from.
    const instance = await boot('url: https://chronique.example.org\n')
    const response = await instance.app.inject({ url: '/api/settings' })
    const payload = response.json() as { values: ReadonlyArray<{ path: readonly string[] }> }
    expect(payload.values.some((value) => value.path[0] === 'url')).toBe(false)
    expect(response.body).not.toContain('chronique.example.org')
  })

  it('does not change the webmanifest — start_url and scope stay at the site root', async () => {
    // "Pas de changement du webmanifest ni des chemins relatifs existants
    // (start_url, scope restent /)."
    const instance = await boot('url: https://chronique.example.org\n')
    const response = await instance.app.inject({ url: '/manifest.webmanifest' })
    const manifest = response.json() as { start_url: string; scope: string }
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })
})

describe('B-4 — échec: a declared value that is not an instance address is refused', () => {
  it('refuses a protocol that is neither http nor https', async () => {
    const error = await bootRejecting('url: ftp://chronique.example.org\n')
    expect(error.message).toMatch(/url must be http or https/)
  })

  it('refuses a URL carrying a query string', async () => {
    const error = await bootRejecting('url: "https://chronique.example.org/jeux?x=1"\n')
    expect(error.message).toMatch(/must not carry a query or a fragment/)
  })

  it('refuses a URL carrying a fragment', async () => {
    const error = await bootRejecting('url: "https://chronique.example.org/jeux#top"\n')
    expect(error.message).toMatch(/must not carry a query or a fragment/)
  })

  it('refuses a string that is not a URL at all', async () => {
    const error = await bootRejecting('url: "pas une url"\n')
    expect(error.message).toMatch(/is not a valid URL/)
  })

  it('never half-starts on a rejected address — nothing is left listening', async () => {
    // A config error must cost the boot, not leave a server up with no agent
    // contract for it (the pattern every other config error in this file
    // already follows — this feature must not special-case the url field).
    await bootRejecting('url: ftp://chronique.example.org\n')
    expect(started).toBeUndefined()
  })
})
