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

import { readFile, readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { parseFrontmatter } from './pages.js'

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
