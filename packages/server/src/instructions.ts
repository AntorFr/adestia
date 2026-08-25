/**
 * The instruction zone: the prose a person may read and correct.
 *
 * Two axes decide what belongs here, and conflating them was the mistake this
 * file exists to avoid.
 *
 * WHAT IT DOES. Prose is a document — a bad one produces bad work, and that is
 * recoverable. A permission list is not a document, and lives behind the
 * authority gate instead. Only the first kind is served here.
 *
 * WHO WROTE IT. The core delivers plugin contracts into the very same folders,
 * rewriting them at EVERY start. Offering to edit one would offer an edit that
 * silently disappears on the next restart — so delivered files are excluded by
 * their marker, not by their path. Their absence is deliberate in the other
 * direction too: a plugin's data-format contract is a technical spec nobody
 * asked to read.
 *
 * What is left is exactly what somebody typed themselves, or asked the agent
 * to type for them: "read my email like this", "always answer in French".
 */

import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { MANAGED_MARKER } from './skills.js'

export interface InstructionFile {
  /** Workspace-relative, forward slashes, as the API speaks. */
  readonly path: string
  readonly modified: string
  readonly bytes: number
}

/** Extensions a person edits as text. Anything else is not prose. */
const PROSE = new Set(['.md', '.markdown', '.txt'])

const isProse = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && PROSE.has(name.slice(dot).toLowerCase())
}

/**
 * Everything under one declared path that a person may edit.
 *
 * A managed file is skipped after being READ, which costs an open per file and
 * is the point: the marker is the truth about who owns a file, and inferring
 * ownership from its name would be exactly the guess that makes an edit
 * vanish.
 */
async function walk(root: string, path: string, depth = 0): Promise<InstructionFile[]> {
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
    if (contents.includes(MANAGED_MARKER)) return []
    return [
      {
        path: path.split(sep).join('/'),
        modified: new Date(info.mtimeMs).toISOString(),
        bytes: info.size,
      },
    ]
  }

  if (!info.isDirectory()) return []
  const found: InstructionFile[] = []
  for (const entry of await readdir(absolute, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === 'node_modules') continue
    found.push(...(await walk(root, join(path, entry.name), depth + 1)))
  }
  return found
}

/** A declared path, and whether it holds one file or many. */
export interface InstructionPath {
  readonly path: string
  readonly kind: 'file' | 'folder'
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
  paths: readonly string[],
): Promise<readonly InstructionPath[]> {
  const described: InstructionPath[] = []
  for (const path of paths) {
    try {
      const info = await stat(join(workspaceRoot, path))
      described.push({
        path: path.split(sep).join('/'),
        kind: info.isDirectory() ? 'folder' : 'file',
        exists: true,
      })
    } catch {
      described.push({ path: path.split(sep).join('/'), kind: 'file', exists: false })
    }
  }
  return described
}

export async function listInstructions(
  workspaceRoot: string,
  paths: readonly string[],
): Promise<readonly InstructionFile[]> {
  const found: InstructionFile[] = []
  for (const path of paths) found.push(...(await walk(workspaceRoot, path)))
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * A requested path, resolved inside the declared zone or refused.
 *
 * Membership is checked against the DECLARED paths rather than against the
 * listing: a file somebody is creating is not in the listing yet, and a zone
 * you can read but never write to is a viewer, not an editor.
 */
export function safeInstructionPath(
  workspaceRoot: string,
  paths: readonly string[],
  requested: unknown,
): string | undefined {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) {
    return undefined
  }
  const target = resolve(workspaceRoot, `./${requested.replace(/^\/+/, '')}`)
  const inside = relative(workspaceRoot, target)
  if (inside.startsWith('..') || inside.startsWith(`..${sep}`)) return undefined
  if (!isProse(target)) return undefined

  const allowed = paths.some((path) => {
    const zone = resolve(workspaceRoot, path)
    return target === zone || target.startsWith(zone + sep)
  })
  return allowed ? target : undefined
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
