/**
 * The instruction zone: the prose a person may read, and mostly correct.
 *
 * Two axes decide what belongs here, and conflating them was the mistake this
 * file exists to avoid.
 *
 * WHAT IT DOES. Prose is a document — a bad one produces bad work, and that is
 * recoverable. A permission list, a hook or MCP wiring is not a document, and
 * is deliberately not served here. Only the first kind is.
 *
 * WHO WROTE IT. The core delivers plugin contracts into the very same folders,
 * rewriting them at EVERY start. A delivered file is therefore told apart by
 * its marker, never by its path — but it is REPORTED rather than hidden, and
 * that is a correction. Hiding them meant the screen answered "what is the
 * agent reading?" with half the truth: an instance whose behaviour comes
 * largely from plugin contracts showed a near-empty list, and somebody
 * hunting for the rule that made the agent do something could not find it
 * because it was not theirs. So `managed` travels with every file, the shell
 * draws those without a Save, and the route refuses the write anyway — an
 * edit that disappears at the next restart is still worth refusing twice.
 *
 * WHEN IT IS READ. A third axis, added because the listing was flat and the
 * screen it fed could not answer the one question a person actually asks of
 * thirty files: which of these reaches the model on EVERY turn? A standing
 * brief, a skill nothing has matched yet and a subagent's charter are three
 * different weights, and a grid of identical cards gave them the same one.
 * The kind comes from the ZONE the file was found in, which the driver
 * declares — see `InstructionZone` for why it is not read off the folder's
 * name.
 */

import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import type { InstructionKind, InstructionZone } from '@antorfr/adestia-drivers'

import { parseFrontmatter } from './pages.js'
import { MANAGED_MARKER } from './skills.js'

export interface InstructionFile {
  /** Workspace-relative, forward slashes, as the API speaks. */
  readonly path: string
  readonly modified: string
  readonly bytes: number
  /**
   * Delivered by the product or by a plugin, and rewritten at every start.
   *
   * Read from the file's own marker rather than from where it sits, because
   * the core writes its contracts into the very folders a person writes in.
   */
  readonly managed: boolean
  /** Which zone it came from, and therefore when the engine reads it. */
  readonly kind: InstructionKind
  /**
   * The frontmatter `name`, when there is one.
   *
   * Preferred over the filename by whoever draws it, because it is the
   * identifier the ENGINE uses: a subagent invoked as `code-reviewer` living
   * in `reviewer.md` is findable under the name it answers to, or it is not
   * findable at all.
   */
  readonly name?: string
  /**
   * The frontmatter `description` — what the thing is for, in its author's
   * words, and for a skill the very sentence the engine matches a task
   * against. It is the one line that tells two `SKILL.md` files apart before
   * either is opened, which a byte count never did.
   */
  readonly description?: string
}

/** Extensions a person edits as text. Anything else is not prose. */
const PROSE = new Set(['.md', '.markdown', '.txt'])

const isProse = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && PROSE.has(name.slice(dot).toLowerCase())
}

/**
 * One frontmatter field, when it is a usable line of prose.
 *
 * Anything that is not a non-empty string is dropped rather than coerced: a
 * YAML block scalar (`description: >`) parses shallowly to its indicator, and
 * a card captioned `>` is worse than a card with no caption.
 */
function field(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '>' || trimmed === '|') return undefined
  return trimmed
}

/**
 * Everything under one declared zone, each carrying who owns it and when it
 * is read.
 *
 * Every file is READ, not stat-ed, which costs an open apiece and is the
 * point: the marker is the truth about who owns a file, and inferring
 * ownership from its name would be exactly the guess that makes an edit
 * vanish. The frontmatter rides along on that same open, for free.
 */
async function walk(
  root: string,
  path: string,
  kind: InstructionKind,
  depth = 0,
): Promise<InstructionFile[]> {
  if (depth > 5) return []
  const absolute = join(root, path)

  let info
  try {
    info = await stat(absolute)
  } catch {
    // A declared path that does not exist yet is not an error: `CLAUDE.md` is
    // absent until somebody writes one.
    return []
  }

  if (info.isFile()) {
    if (!isProse(absolute)) return []
    const contents = await readFile(absolute, 'utf8').catch(() => '')
    const fields = parseFrontmatter(contents)
    const name = field(fields, 'name')
    const description = field(fields, 'description')
    return [
      {
        path: path.split(sep).join('/'),
        modified: new Date(info.mtimeMs).toISOString(),
        bytes: info.size,
        managed: contents.includes(MANAGED_MARKER),
        kind,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      },
    ]
  }

  if (!info.isDirectory()) return []
  const found: InstructionFile[] = []
  for (const entry of await readdir(absolute, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === 'node_modules') continue
    found.push(...(await walk(root, join(path, entry.name), kind, depth + 1)))
  }
  return found
}

/** A declared path, what it holds, and whether it is one file or many. */
export interface InstructionPath {
  readonly path: string
  /** The SHAPE on disk: one file, or a folder holding many. */
  readonly kind: 'file' | 'folder'
  /** What the driver says lives there — and therefore when it is read. */
  readonly holds: InstructionKind
  /**
   * Where a new one goes inside a folder, `<name>` standing for a slug. The
   * client must not invent this: writing `<name>/SKILL.md` into the subagent
   * folder produced a file no engine opens, and said nothing about it.
   */
  readonly entry?: string
  /** False for a `file` nobody has written yet — the one worth offering. */
  readonly exists: boolean
}

/**
 * Where an instruction may be written.
 *
 * The listing answers "what is there"; a fresh instance has nothing there,
 * and a screen showing an empty list with no way to add to it is a feature
 * nobody can start using. Only the driver knows these paths, so the client is
 * told rather than left to guess.
 *
 * A declared path that does not exist yet is a FILE by convention: a folder
 * is named as a place to put things, and the things are what get created.
 */
export async function describeInstructionPaths(
  workspaceRoot: string,
  zones: readonly InstructionZone[],
): Promise<readonly InstructionPath[]> {
  const described: InstructionPath[] = []
  for (const zone of zones) {
    const path = zone.path.split(sep).join('/')
    const entry = zone.entry ? { entry: zone.entry } : {}
    try {
      const info = await stat(join(workspaceRoot, zone.path))
      described.push({
        path,
        kind: info.isDirectory() ? 'folder' : 'file',
        holds: zone.kind,
        ...entry,
        exists: true,
      })
    } catch {
      described.push({ path, kind: 'file', holds: zone.kind, ...entry, exists: false })
    }
  }
  return described
}

export async function listInstructions(
  workspaceRoot: string,
  zones: readonly InstructionZone[],
): Promise<readonly InstructionFile[]> {
  const found: InstructionFile[] = []
  for (const zone of zones) found.push(...(await walk(workspaceRoot, zone.path, zone.kind)))
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * A requested path, resolved inside the declared zone or refused.
 *
 * Membership is checked against the DECLARED zones rather than against the
 * listing: a file somebody is creating is not in the listing yet, and a zone
 * you can read but never write to is a viewer, not an editor.
 */
export function safeInstructionPath(
  workspaceRoot: string,
  zones: readonly InstructionZone[],
  requested: unknown,
): string | undefined {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) {
    return undefined
  }
  const target = resolve(workspaceRoot, `./${requested.replace(/^\/+/, '')}`)
  const inside = relative(workspaceRoot, target)
  if (inside.startsWith('..') || inside.startsWith(`..${sep}`)) return undefined
  if (!isProse(target)) return undefined

  const allowed = zones.some(({ path }) => {
    const zone = resolve(workspaceRoot, path)
    return target === zone || target.startsWith(zone + sep)
  })
  return allowed ? target : undefined
}

/**
 * What kind of prose a requested path is, from the zone it falls in.
 *
 * The longest matching zone wins, because zones nest: `.claude/skills` sits
 * under nothing here today, but a driver declaring both a folder and a file
 * inside it would otherwise be answered by whichever came first.
 */
export function instructionKindOf(
  workspaceRoot: string,
  zones: readonly InstructionZone[],
  absolute: string,
): InstructionKind {
  let best: InstructionZone | undefined
  for (const zone of zones) {
    const root = resolve(workspaceRoot, zone.path)
    if (absolute !== root && !absolute.startsWith(root + sep)) continue
    if (!best || root.length > resolve(workspaceRoot, best.path).length) best = zone
  }
  return best?.kind ?? 'instruction'
}

/** Whether this file is the core's rather than the user's. */
export async function isManaged(absolute: string): Promise<boolean> {
  const contents = await readFile(absolute, 'utf8').catch(() => '')
  return contents.includes(MANAGED_MARKER)
}

export async function writeInstruction(absolute: string, markdown: string): Promise<void> {
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, markdown, 'utf8')
}
