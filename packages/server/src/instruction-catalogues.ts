/**
 * Scanning a catalogue repository for instruction items — BY THE SHAPE of a
 * file, never by a folder convention.
 *
 * Verified on a real case (`homelab-sdlc-core`, 2026-09-30): its skills live at
 * `dev-flow/skills/<name>/SKILL.md`, outside every convention an engine ships
 * (`.claude/`, `.codex/`, `.github/`). A scan that only looked in those
 * folders would have found nothing in the very catalogue that motivated this
 * feature. So the walk covers the whole clone, and what makes a file an item
 * is its own shape:
 *
 * - any `SKILL.md`, wherever it sits — the item is its PARENT folder.
 * - any `<name>.agent.md` carrying both a `name` and a `description` in its
 *   frontmatter — the item is the file itself.
 * - `CLAUDE.md` / `AGENTS.md` at the catalogue's ROOT — the one place an
 *   instruction file is unambiguous without reading a driver's declared
 *   zones, which a catalogue has none of (it belongs to no engine yet).
 *
 * The agent heuristic is the weaker of the three, and deliberately so: a
 * driver as simple as `claude-code`'s (`.claude/agents/<name>.md`, a bare
 * name with no shared suffix) cannot be told apart from an ordinary document
 * by frontmatter alone, so it is not attempted here — only the `.agent.md`
 * suffix `copilot-cli` uses is a shape, not a path. Revisit if a real
 * catalogue surfaces a counter-example, the same way the skill heuristic was
 * settled by one.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'

import type { InstructionZone } from '@antorfr/adestia-drivers'

import { parseFrontmatter } from './pages.js'
import { MANAGED_MARKER, stamped } from './skills.js'
import type { CatalogueImport, InstructionCatalogue, InstructionCataloguesStore } from './instruction-catalogues-store.js'

export type CatalogueItemKind = 'skill' | 'agent' | 'instruction'

export interface CatalogueItem {
  /** Catalogue-relative, forward slashes: the folder for a skill, the file otherwise. */
  readonly itemPath: string
  readonly kind: CatalogueItemKind
  /** The frontmatter `name`, when there is one. */
  readonly name?: string
  /** The frontmatter `description`, when it is a usable line of prose. */
  readonly description?: string
}

/** Never part of the catalogue's own content, whatever shape it takes on. */
const SKIPPED_DIRS = new Set(['.git', 'node_modules'])

/** A tree deep enough to need this is a tree that has stopped being a catalogue. */
const MAX_DEPTH = 12

/** One frontmatter field, when it is a usable line of prose — see `instructions.ts`. */
function field(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '>' || trimmed === '|') return undefined
  return trimmed
}

async function readFrontmatter(
  path: string,
): Promise<{ name: string | undefined; description: string | undefined }> {
  const contents = await readFile(path, 'utf8').catch(() => '')
  const fields = parseFrontmatter(contents)
  return { name: field(fields, 'name'), description: field(fields, 'description') }
}

async function walk(root: string, relDir: string, depth: number, items: CatalogueItem[]): Promise<void> {
  if (depth > MAX_DEPTH) return
  const absoluteDir = join(root, relDir)
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue
      await walk(root, join(relDir, entry.name), depth + 1, items)
      continue
    }
    if (!entry.isFile()) continue

    if (entry.name === 'SKILL.md') {
      const { name, description } = await readFrontmatter(join(absoluteDir, entry.name))
      items.push({
        itemPath: relDir.split(sep).join('/'),
        kind: 'skill',
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      })
      continue
    }

    if (entry.name.endsWith('.agent.md')) {
      const { name, description } = await readFrontmatter(join(absoluteDir, entry.name))
      // Without both, this is indistinguishable from any other markdown file
      // — the frontmatter is the only signal an `.agent.md` suffix adds.
      if (name === undefined || description === undefined) continue
      items.push({ itemPath: join(relDir, entry.name).split(sep).join('/'), kind: 'agent', name, description })
      continue
    }

    if (relDir === '' && (entry.name === 'CLAUDE.md' || entry.name === 'AGENTS.md')) {
      const { name, description } = await readFrontmatter(join(absoluteDir, entry.name))
      items.push({
        itemPath: entry.name,
        kind: 'instruction',
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      })
    }
  }
}

/** Every item a catalogue clone offers, sorted for a stable listing. */
export async function scanCatalogue(root: string): Promise<readonly CatalogueItem[]> {
  const items: CatalogueItem[] = []
  await walk(root, '', 0, items)
  return items.sort((a, b) => a.itemPath.localeCompare(b.itemPath))
}

/**
 * Materialising an item — the other half of `deliverSkills`' pattern, aimed
 * at a single catalogue item instead of a whole plugin's set.
 *
 * The destination is never read off a convention: it is the zone the ACTIVE
 * driver declares for the item's `kind`, the same contract `instructions.ts`
 * already reads. A `kind` with no matching zone (an `agent` on `codex-cli`,
 * which declares none) is refused here, at the one place that actually knows
 * — not upstream, where the catalogue has no idea which driver is running.
 */

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Safe for a path segment, and never empty — a blank slug would land nowhere. */
function sanitizeSlug(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'item' : cleaned
}

/** The frontmatter name wins — it is what the engine will call the thing. */
function slugFor(item: CatalogueItem): string {
  const base = item.name ?? basename(item.itemPath).replace(/\.agent\.md$/i, '').replace(/\.md$/i, '')
  return sanitizeSlug(base)
}

/**
 * Where a slug lands inside a zone, workspace-relative with forward slashes.
 *
 * A zone with no `entry` is a single file (`CLAUDE.md`): the slug plays no
 * part, the item lands at the zone itself. An `entry` with a `/` names a
 * FOLDER (`<name>/SKILL.md`) — `landedAt` is the folder, matching what the
 * scan already calls the unit for a skill. An `entry` with none is a flat
 * file (`<name>.md`, `<name>.agent.md`).
 */
function landedPathFor(zone: InstructionZone, slug: string): string {
  const relative =
    zone.entry === undefined
      ? zone.path
      : zone.entry.includes('/')
        ? join(zone.path, slug)
        : join(zone.path, zone.entry.replace('<name>', slug))
  return relative.split(sep).join('/')
}

/**
 * The landing path for a fresh import, namespaced away from a collision
 * rather than refused or silently overwritten.
 *
 * A local skill called `tri` and a catalogue item called `tri` are two
 * different things that happen to share a name — exactly the case
 * `technique.md` calls out as the reason `landedAt` is tracked apart from
 * `itemPath`. The same move `skills.ts` makes for two plugins sharing a
 * skill name, applied here to a catalogue sharing one with the workspace.
 */
async function chooseLandedAt(
  workspaceRoot: string,
  zone: InstructionZone,
  item: CatalogueItem,
  catalogueId: string,
): Promise<string> {
  // A zone with no `entry` is ONE file (CLAUDE.md, AGENTS.md): there is no
  // `<name>` to substitute, so no namespaced fallback can exist. An existing
  // file is the normal case and is never ours to overwrite on a first import.
  if (zone.entry === undefined) {
    const single = landedPathFor(zone, '')
    if (await pathExists(resolve(workspaceRoot, single))) {
      throw new Error(
        `cannot import "${item.itemPath}": the active driver keeps its ${item.kind} in a single file, "${single}", which already exists — remove or merge it by hand first`,
      )
    }
    return single
  }

  const slug = slugFor(item)
  const primary = landedPathFor(zone, slug)
  if (!(await pathExists(resolve(workspaceRoot, primary)))) return primary

  const fallback = landedPathFor(zone, sanitizeSlug(`${catalogueId}-${slug}`))
  if (!(await pathExists(resolve(workspaceRoot, fallback)))) return fallback

  throw new Error(`cannot import "${item.itemPath}": both "${primary}" and "${fallback}" already exist`)
}

/**
 * Copies a skill's whole folder, not just its `SKILL.md` — a real skill
 * carries scripts and references beside its contract, and those are not
 * instructions to stamp, just files to hand over untouched.
 */
async function copyMarkedTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const from = join(sourceDir, entry.name)
    const to = join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyMarkedTree(from, to)
      continue
    }
    if (entry.name === 'SKILL.md') {
      await writeFile(to, stamped(await readFile(from, 'utf8')), 'utf8')
      continue
    }
    await writeFile(to, await readFile(from))
  }
}

export interface MaterializeOptions {
  readonly workspaceRoot: string
  /** The active driver's declared zones — `instructionZones(driver)`. */
  readonly zones: readonly InstructionZone[]
  /** The catalogue's clone on disk, as `fetchSources` left it. */
  readonly catalogueRoot: string
  readonly item: CatalogueItem
  readonly catalogueId: string
  /** A refresh keeps an import's path stable rather than re-choosing a slug. */
  readonly landedAt?: string
}

/** Writes one catalogue item into the zone the active driver declares for its kind. */
export async function materializeItem(options: MaterializeOptions): Promise<{ landedAt: string }> {
  const { workspaceRoot, zones, catalogueRoot, item, catalogueId, landedAt: reuse } = options
  const zone = zones.find((candidate) => candidate.kind === item.kind)
  if (!zone) {
    throw new Error(
      `"${item.itemPath}" is a ${item.kind}, and the active driver declares no ${item.kind} zone to land it in`,
    )
  }

  const landedAt = reuse ?? (await chooseLandedAt(workspaceRoot, zone, item, catalogueId))
  const sourceAbsolute = join(catalogueRoot, ...item.itemPath.split('/'))
  const targetAbsolute = resolve(workspaceRoot, landedAt)

  if (item.kind === 'skill') {
    await copyMarkedTree(sourceAbsolute, targetAbsolute)
  } else {
    const contents = await readFile(sourceAbsolute, 'utf8')
    await mkdir(dirname(targetAbsolute), { recursive: true })
    await writeFile(targetAbsolute, stamped(contents), 'utf8')
  }

  return { landedAt }
}

/**
 * Removes what `materializeItem` wrote, and only that.
 *
 * Checked against the marker before anything is deleted — the same guard
 * `deliverSkills` applies — so a folder that still exists at `landedAt` but
 * was somehow never ours (hand-edited past recognition, or never written) is
 * left alone rather than destroyed on the strength of a path alone.
 */
export async function withdrawItem(workspaceRoot: string, landedAt: string): Promise<void> {
  const absolute = resolve(workspaceRoot, landedAt)
  const info = await stat(absolute).catch(() => undefined)
  if (!info) return

  if (info.isDirectory()) {
    const entry = await readFile(join(absolute, 'SKILL.md'), 'utf8').catch(() => '')
    if (!entry.includes(MANAGED_MARKER)) return
    await rm(absolute, { recursive: true })
    return
  }

  const contents = await readFile(absolute, 'utf8').catch(() => '')
  if (!contents.includes(MANAGED_MARKER)) return
  await rm(absolute)
}

/**
 * Imports one item and records where it landed — the two happen together
 * because a `landedAt` nobody wrote down cannot be refreshed or withdrawn
 * later, and a store entry with nothing on disk behind it is a lie.
 */
export async function importCatalogueItem(
  store: InstructionCataloguesStore,
  catalogueId: string,
  catalogueRoot: string,
  workspaceRoot: string,
  zones: readonly InstructionZone[],
  item: CatalogueItem,
): Promise<CatalogueImport> {
  return store.update(async (catalogues) => {
    const catalogue = catalogues.find((candidate) => candidate.id === catalogueId)
    if (!catalogue) throw new Error(`no catalogue declared with id "${catalogueId}"`)

    const { landedAt } = await materializeItem({ workspaceRoot, zones, catalogueRoot, item, catalogueId })
    const imported: CatalogueImport = { itemPath: item.itemPath, kind: item.kind, landedAt }

    const updated: InstructionCatalogue[] = catalogues.map((candidate) =>
      candidate.id === catalogueId
        ? { ...candidate, imports: [...candidate.imports.filter((entry) => entry.itemPath !== item.itemPath), imported] }
        : candidate,
    )
    return { catalogues: updated, result: imported }
  })
}

/** Retires one item: cleans what it had copied, and drops it from the store. */
export async function withdrawCatalogueItem(
  store: InstructionCataloguesStore,
  workspaceRoot: string,
  catalogueId: string,
  itemPath: string,
): Promise<void> {
  await store.update(async (catalogues) => {
    const catalogue = catalogues.find((candidate) => candidate.id === catalogueId)
    const entry = catalogue?.imports.find((candidate) => candidate.itemPath === itemPath)
    if (!catalogue || !entry) return { catalogues, result: undefined }

    await withdrawItem(workspaceRoot, entry.landedAt)

    const updated: InstructionCatalogue[] = catalogues.map((candidate) =>
      candidate.id === catalogueId
        ? { ...candidate, imports: candidate.imports.filter((kept) => kept.itemPath !== itemPath) }
        : candidate,
    )
    return { catalogues: updated, result: undefined }
  })
}
