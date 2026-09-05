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
import type { Store } from './stores.js'

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

/**
 * `{{plugin_dir}}`, resolved to where the plugin actually sits.
 *
 * A plugin that ships a tool has to tell the agent how to run it, and had no
 * way to say WHERE: a path relative to the plugin folder does not resolve from
 * the agent's working directory, which is the workspace, and the absolute one
 * is an operator's choice (`extensions.pluginsDir`) the plugin cannot know.
 * Atelier wrote `node plugins/atelier/tools/atelier.mjs`, the agent ran it
 * from the workspace, got "Cannot find module", and concluded in writing — in
 * two project fiches — that the validator was "out of reach in this
 * environment". It was installed and working the whole time.
 *
 * Substituted at delivery because that is the only moment both halves are
 * known: the plugin's text, and the path this instance put it at.
 */
function resolvePluginDir(contents: string, dir: string): string {
  return contents.replaceAll('{{plugin_dir}}', dir)
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
          contents: resolvePluginDir(nameForFolder(contents, folder), plugin.dir),
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

/**
 * The one contract this product WRITES rather than ships.
 *
 * Every other skill is a file next to the code that reads it. This one cannot
 * be: it states where THIS instance's stores are, and that is configuration.
 * The agent is the only author here that works on files directly — the shell
 * goes through routes, plugins through a service — so it is the one place
 * where disclosing the physical layout is not just legitimate but required.
 *
 * Delivered only when there is more than one store. On a single-store instance
 * it would teach a division that does not exist, and every sentence in it
 * would be noise the agent carries into every turn.
 */
function storesContract(stores: readonly Store[]): SkillFile {
  const rows = stores
    .map((store) => {
      const where = store.at === '' ? 'the whole tree' : `\`${store.at}/\``
      const mine = store.isDefault ? ' — **this shell writes here by default**' : ''
      return `- **${store.label}** (\`${store.id}\`) — \`${store.dir}\` on disk, and it appears under ${where}${mine}`
    })
    .join('\n')

  const contents = `---
name: memory-stores
description: This instance's memory is composed of several stores. Where each one is on disk, and how to choose one when writing.
---

# The stores this instance composes

Memory here is not one folder. It is the union of several, and a page's name
never says which one carries it: \`domaines/voyages/italie.md\` is a NAME, and
the store is a fact of location. That is what lets a page move from one circle
to another without breaking a single wikilink or reference.

${rows}

The interface shows one merged tree. You work on files, so you see the folders
above — the same page may exist in two of them, and that is a real state, not
a mistake to clean up.

## Choosing where to write

**Editing an existing page: write where it already is.** Never copy it into
another store to edit it. The interface draws both copies, so a page written
to the wrong store shows up as two cards, one of them the correction nobody
asked for and the other the one the reader meant.

**Creating a page in a folder that exists in only one store: use that store.**
No question to ask — the answer is already on disk.

**Creating a page in a folder several stores carry: ASK which one.** This is
the only case nobody can deduce, and choosing silently files somebody's note in
somebody else's circle. Name the choices and let the person answer.

Everything else — a new folder, a page at the root — goes to the default store
named above.

## Tools that ask for the memory folder

A tool of this instance that takes a memory directory needs ALL of them, not the
first — otherwise it reads one circle and reports on it as if it were
everything. They are comma-separated, in the order above:

\`\`\`sh
--pages ${stores.map((store) => store.dir).join(',')}
\`\`\`

## What never composes

A scheduled note belongs to THIS instance, not to memory: it lives beside the
workspace and is never read from a store. Its body is the prompt of a turn, and
a shared store is a place where somebody else writes.
`
  return { path: 'memory-stores/SKILL.md', contents, source: 'core' }
}

export async function collectSkills(
  plugins: readonly DiscoveredPlugin[],
  stores: readonly Store[] = [],
): Promise<{ skills: readonly SkillFile[]; problems: readonly string[] }> {
  const core = await readCoreSkills()
  const { skills: fromPlugins, problems } = await readPluginSkills(plugins)
  const composed = stores.length > 1 ? [storesContract(stores)] : []
  return { skills: [...core, ...fromPlugins, ...composed], problems }
}

/** Marks what Adestia manages, so a hand-written skill is never touched. */
/**
 * Stamped on every delivered file, and the single source of truth about who
 * owns one. Withdrawal reads it before removing anything, and the instruction
 * zone reads it before offering anything for editing — both would otherwise
 * have to guess from a path.
 */
export const MANAGED_MARKER = '<!-- managed by Adestia: edits here are overwritten -->'

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
