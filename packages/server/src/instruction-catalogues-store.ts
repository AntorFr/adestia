/**
 * The instruction-catalogues the SHELL declared, and what each has imported.
 *
 * A dépôt-catalogue is not config: it is state that changes on every import
 * or removal a person makes from the Instructions screen, at a rate
 * `adestia.config.yaml` was never meant for — and in the deployment this
 * product targets that file is often mounted `:ro`. Same reasoning as
 * `McpStore`, same answer: its own file in the data directory, written only
 * by this process.
 *
 * A catalogue can carry a `token` for a private repository, so this file is
 * written 0600 through a temporary file and rename, exactly like
 * `mcp-store.ts` — the pattern this module reuses rather than reinvents.
 *
 * What lands here is deliberately thin: the list of declared catalogues and,
 * for each, the imports it has materialised (`itemPath` in the catalogue,
 * `landedAt` on disk — the two can diverge on a name collision). Scanning a
 * catalogue's tree and writing an imported item into a driver's zone are
 * both someone else's job; this file only remembers what was decided.
 */

import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import type { InstructionKind } from '@antorfr/adestia-drivers'

const KINDS: ReadonlySet<string> = new Set<InstructionKind>(['instruction', 'skill', 'agent'])

/** One item a catalogue has materialised, by the driver zone it landed in. */
export interface CatalogueImport {
  /** Where the item sits inside the catalogue's tree. */
  readonly itemPath: string
  readonly kind: InstructionKind
  /**
   * Where it was actually written.
   *
   * Named separately from `itemPath` because the two can diverge — a
   * collision with a local skill of the same name, for one — and this is
   * the value a refresh or a removal must retrace without ambiguity.
   */
  readonly landedAt: string
}

/** A declared dépôt-catalogue, and the imports made from it. */
export interface InstructionCatalogue {
  readonly id: string
  readonly repo: string
  readonly ref: string
  /** For a private repository. Never sent to the browser unmasked. */
  readonly token?: string
  readonly imports: readonly CatalogueImport[]
}

function readImport(raw: unknown): CatalogueImport | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const { itemPath, kind, landedAt } = raw as Record<string, unknown>
  if (typeof itemPath !== 'string' || itemPath === '') return undefined
  if (typeof kind !== 'string' || !KINDS.has(kind)) return undefined
  if (typeof landedAt !== 'string' || landedAt === '') return undefined
  return { itemPath, kind: kind as InstructionKind, landedAt }
}

function readCatalogue(raw: unknown): InstructionCatalogue | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const { id, repo, ref, token, imports } = raw as Record<string, unknown>
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof repo !== 'string' || repo === '') return undefined
  if (typeof ref !== 'string' || ref === '') return undefined
  if (token !== undefined && typeof token !== 'string') return undefined
  if (!Array.isArray(imports)) return undefined

  const kept: CatalogueImport[] = []
  for (const entry of imports) {
    const item = readImport(entry)
    if (item) kept.push(item)
  }

  return { id, repo, ref, ...(token !== undefined ? { token } : {}), imports: kept }
}

/**
 * The dépôts-catalogues on disk, read and written like `McpStore`.
 *
 * Writes are serialized through one chain for the same reason as there: two
 * requests editing two different catalogues at once must not read-modify-write
 * the same file and lose one of them.
 */
export class InstructionCataloguesStore {
  readonly #path: string
  #queue: Promise<unknown> = Promise.resolve()
  /** The last list read or written, so a caller need not always await a read. */
  #cache: readonly InstructionCatalogue[] = []

  constructor(dataDir: string) {
    this.#path = join(dataDir, 'instruction-catalogues.json')
  }

  /** The last known list, without touching the disk. */
  current(): readonly InstructionCatalogue[] {
    return this.#cache
  }

  /**
   * What is stored, validated on the way out.
   *
   * A file somebody hand-edited into nonsense yields the entries that still
   * parse rather than an exception — an instance must boot, and a catalogue
   * that cannot be read is a catalogue that is absent, which the screen can
   * say.
   */
  async list(): Promise<readonly InstructionCatalogue[]> {
    let raw: string
    try {
      raw = await readFile(this.#path, 'utf8')
    } catch {
      this.#cache = []
      return this.#cache
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.#cache = []
      return this.#cache
    }
    const catalogues = (parsed as { catalogues?: unknown })?.catalogues
    if (!Array.isArray(catalogues)) {
      this.#cache = []
      return this.#cache
    }
    const kept: InstructionCatalogue[] = []
    for (const entry of catalogues) {
      const catalogue = readCatalogue(entry)
      if (catalogue) kept.push(catalogue)
    }
    this.#cache = kept
    return this.#cache
  }

  /** Replaces the whole list, atomically and at 0600. */
  async save(catalogues: readonly InstructionCatalogue[]): Promise<void> {
    const write = this.#queue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true })
      const temporary = `${this.#path}.${randomUUID()}.tmp`
      try {
        // The mode is set at creation rather than after: a file created 0644
        // and chmod-ed is world-readable for as long as that takes, and it
        // can hold a bearer token.
        await writeFile(temporary, `${JSON.stringify({ catalogues }, null, 2)}\n`, { mode: 0o600 })
        await chmod(temporary, 0o600)
        await rename(temporary, this.#path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
      // Only once it is on disk: a cache updated before the write would hand
      // a caller a catalogue that a failed rename never actually stored.
      this.#cache = catalogues
    })
    this.#queue = write.catch(() => undefined)
    await write
  }
}
