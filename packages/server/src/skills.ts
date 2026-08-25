/**
 * Delivering agent contracts — the product's own, and every active plugin's.
 *
 * A contract ships with the code that reads it, so the two cannot drift: the
 * plugin that renders a block and the skill that teaches how to write one are
 * the same version, in the same folder, always.
 *
 * The driver says WHERE its CLI looks for skills; the core does the writing.
 * That split is what lets a second engine work with no change here — and what
 * keeps a driver from being handed a filesystem writer it could point
 * anywhere.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DiscoveredPlugin } from './extensions.js'

/**
 * Finds the product's own skills directory by walking up.
 *
 * Counting `../` from `import.meta.url` is what everyone writes first, and it
 * silently breaks the moment the code runs from `dist/` instead of `src/` —
 * one level deeper, no error, just zero contracts delivered and an agent that
 * never learns what it can do. Searching for the directory works from both.
 */
async function findCoreSkills(): Promise<string | undefined> {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'skills')
    try {
      if ((await stat(join(candidate, 'plugin-author', 'SKILL.md'))).isFile()) return candidate
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export interface SkillFile {
  /** `<name>/SKILL.md`, the path under the skills directory. */
  readonly path: string
  readonly contents: string
  /** Which plugin brought it, or `core` for the product's own. */
  readonly source: string
}

async function readCoreSkills(): Promise<readonly SkillFile[]> {
  const root = await findCoreSkills()
  // Missing in a stripped-down install rather than an error: an instance with
  // no authoring skills still runs perfectly well.
  if (!root) return []

  let entries: string[]
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }

  const skills: SkillFile[] = []
  for (const name of entries.sort()) {
    try {
      const contents = await readFile(join(root, name, 'SKILL.md'), 'utf8')
      skills.push({ path: `${name}/SKILL.md`, contents, source: 'core' })
    } catch {
      continue
    }
  }
  return skills
}

/**
 * The frontmatter `name`, rewritten to the folder the skill is delivered into.
 *
 * A plugin writes its skill under a bare name — `voyage-json` — because inside
 * the plugin nothing else is called that. Delivery namespaces the FOLDER to
 * keep two plugins from overwriting each other, and until now copied the
 * frontmatter through untouched: every plugin skill landed claiming a name its
 * own folder contradicted.
 *
 * That is not a cosmetic disagreement. It leaves nobody able to write down
 * what the skill is called — the prose that points at it has two candidate
 * names and no way to pick. Making the folder win settles it, whichever of the
 * two an engine happens to key on.
 */
function nameForFolder(contents: string, folder: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)
  if (!frontmatter) return contents
  const renamed = frontmatter[1]!.replace(/^name:[^\r\n]*/m, `name: ${folder}`)
  if (renamed === frontmatter[1]) return contents
  return contents.replace(frontmatter[1]!, renamed)
}

/** Only ACTIVE plugins contribute: an inactive one teaches nothing either. */
async function readPluginSkills(
  plugins: readonly DiscoveredPlugin[],
): Promise<{ skills: readonly SkillFile[]; problems: readonly string[] }> {
  const skills: SkillFile[] = []
  const problems: string[] = []

  for (const plugin of plugins) {
    if (!plugin.active) continue
    for (const relative of plugin.manifest.skills ?? []) {
      try {
        const contents = await readFile(join(plugin.dir, relative), 'utf8')
        // Namespaced by plugin id so two plugins may both ship a skill called
        // "author" without one quietly overwriting the other.
        const name = relative.replace(/^\.\//, '').split('/').slice(-2, -1)[0] ?? 'skill'
        const folder = `${plugin.manifest.id}-${name}`
        skills.push({
          path: `${folder}/SKILL.md`,
          contents: nameForFolder(contents, folder),
          source: plugin.manifest.id,
        })
      } catch (error) {
        // Reported, not fatal: a plugin whose contract is missing still works,
        // but the agent will not know it exists — and that is worth saying.
        problems.push(`${plugin.manifest.id}: ${(error as Error).message}`)
      }
    }
  }
  return { skills, problems }
}

export async function collectSkills(
  plugins: readonly DiscoveredPlugin[],
): Promise<{ skills: readonly SkillFile[]; problems: readonly string[] }> {
  const core = await readCoreSkills()
  const { skills: fromPlugins, problems } = await readPluginSkills(plugins)
  return { skills: [...core, ...fromPlugins], problems }
}

/** Marks what Golem manages, so a hand-written skill is never touched. */
/**
 * Stamped on every delivered file, and the single source of truth about who
 * owns one. Withdrawal reads it before removing anything, and the instruction
 * zone reads it before offering anything for editing — both would otherwise
 * have to guess from a path.
 */
export const MANAGED_MARKER = '<!-- managed by Golem: edits here are overwritten -->'

/**
 * Writes the contracts into the CLI's own skills directory.
 *
 * Only files carrying the marker are removed on refresh. The workspace belongs
 * to its owner: deleting a skill someone wrote by hand because it sits in the
 * same folder would be the product destroying work it was asked to sit next to.
 */
export async function deliverSkills(
  skillsRoot: string,
  skills: readonly SkillFile[],
): Promise<{ written: number; removed: number }> {
  const root = resolve(skillsRoot)
  await mkdir(root, { recursive: true })

  const wanted = new Set(skills.map((skill) => skill.path))
  let removed = 0

  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const path = join(entry.name, 'SKILL.md')
    if (wanted.has(path)) continue
    try {
      const existing = await readFile(join(root, path), 'utf8')
      if (!existing.includes(MANAGED_MARKER)) continue
      await rm(join(root, entry.name), { recursive: true })
      removed += 1
    } catch {
      continue
    }
  }

  for (const skill of skills) {
    const target = join(root, skill.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${MANAGED_MARKER}\n${skill.contents}`, 'utf8')
  }

  return { written: skills.length, removed }
}
