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

import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DiscoveredPlugin } from './extensions.js'
import { type InstanceFacts, instanceContract } from './introduction.js'
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

/** A file a skill carries beside its `SKILL.md`: a reference, a script. */
export interface SkillAsset {
  /** Relative to the skill's folder, `/`-separated: `references/grille.md`. */
  readonly path: string
  /** Copied byte for byte — a script is not text to rewrite. */
  readonly contents: Buffer
  /** Kept so a script shipped executable is still executable once delivered. */
  readonly mode: number
}

export interface SkillFile {
  /** `<name>/SKILL.md`, the path under the skills directory. */
  readonly path: string
  readonly contents: string
  /** Which plugin brought it, or `core` for the product's own. */
  readonly source: string
  /** Everything else in the skill's folder, delivered next to it. */
  readonly assets?: readonly SkillAsset[]
}

/**
 * Every file under a skill's folder except `SKILL.md` itself.
 *
 * A skill is a FOLDER, not a file: its body says "read `references/x.md`
 * when…" and runs `scripts/y.py`, relative to where it sits. Delivering the
 * `SKILL.md` alone handed the agent a page pointing at files that were never
 * there — the skill looked whole and failed only at the moment it was needed.
 *
 * Hidden entries stay behind (an editor's swap file, a `.DS_Store` are not
 * part of any contract), and so do symbolic links: a link is not a file of the
 * plugin's, and following one would let a plugin copy anything readable on the
 * host into the workspace.
 */
async function readSkillAssets(dir: string, prefix = '', depth = 0): Promise<SkillAsset[]> {
  if (depth > 8) return []
  const assets: SkillAsset[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      assets.push(...(await readSkillAssets(full, path, depth + 1)))
    } else if (entry.isFile() && path !== 'SKILL.md') {
      const [contents, info] = await Promise.all([readFile(full), stat(full)])
      assets.push({ path, contents, mode: info.mode & 0o777 })
    }
  }
  return assets
}

/** Leaves the field out entirely when there is nothing to carry. */
async function withAssets(skill: SkillFile, dir: string): Promise<SkillFile> {
  const assets = await readSkillAssets(dir)
  return assets.length > 0 ? { ...skill, assets } : skill
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
      skills.push(
        await withAssets({ path: `${name}/SKILL.md`, contents, source: 'core' }, join(root, name)),
      )
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
 * A skill's `agent:` field, pointed at the name its envelope is delivered as.
 *
 * Agents are namespaced like skills — `sdlc-relecteur`, not `relecteur` —
 * because the agents folder is shared exactly as the skills folder is: two
 * plugins may both ship a `relecteur`, and the workspace's owner may have
 * written one by hand. Unprefixed, the second delivery would overwrite the
 * first, or the core would be writing over somebody's own file under a name
 * it happened to pick too.
 *
 * Prefixing the file means the plugin's skills must follow, or `agent:
 * relecteur` names nothing and the skill silently runs without its envelope.
 * Only a name THIS plugin ships is rewritten: `agent: Explore` names the
 * engine's own, and another plugin's agent is not this plugin's to claim.
 */
function agentForPlugin(contents: string, plugin: string, shipped: ReadonlySet<string>): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)
  if (!frontmatter) return contents
  const renamed = frontmatter[1]!.replace(
    /^agent:([ \t]*)(["']?)([^"'\r\n]*?)\2[ \t]*$/m,
    (line, space: string, quote: string, name: string) =>
      shipped.has(name) ? `agent:${space}${quote}${plugin}-${name}${quote}` : line,
  )
  if (renamed === frontmatter[1]) return contents
  return contents.replace(frontmatter[1]!, renamed)
}

/** `./agents/relecteur.md` → `relecteur`: the name a skill's `agent:` uses. */
function agentStem(relative: string): string {
  return basename(relative).replace(/\.md$/, '')
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
    const shipped = new Set((plugin.manifest.agents ?? []).map(agentStem))
    for (const relative of plugin.manifest.skills ?? []) {
      try {
        const file = join(plugin.dir, relative)
        const contents = await readFile(file, 'utf8')
        // Namespaced by plugin id so two plugins may both ship a skill called
        // "author" without one quietly overwriting the other.
        const name = relative.replace(/^\.\//, '').split('/').slice(-2, -1)[0] ?? 'skill'
        const folder = `${plugin.manifest.id}-${name}`
        // The renames and `{{plugin_dir}}` touch `SKILL.md` only: the assets are
        // the plugin's files, copied as they are.
        skills.push(
          await withAssets(
            {
              path: `${folder}/SKILL.md`,
              contents: resolvePluginDir(
                agentForPlugin(nameForFolder(contents, folder), plugin.manifest.id, shipped),
                plugin.dir,
              ),
              source: plugin.manifest.id,
            },
            dirname(file),
          ),
        )
      } catch (error) {
        // Reported, not fatal: a plugin whose contract is missing still works,
        // but the agent will not know it exists — and that is worth saying.
        problems.push(`${plugin.manifest.id}: ${(error as Error).message}`)
      }
    }
  }
  return { skills, problems }
}

/** A subagent definition, as delivered: `<plugin>-<name>.md`. */
export interface AgentFile {
  /** The file name under the agents directory. */
  readonly path: string
  readonly contents: string
  /** Which plugin brought it. The core ships no agents. */
  readonly source: string
}

/**
 * Every active plugin's subagent definitions, renamed as their skills name them.
 *
 * The frontmatter `name` follows the file for the reason a skill's does: an
 * engine may key on either, and the two must not disagree.
 */
async function readPluginAgents(
  plugins: readonly DiscoveredPlugin[],
): Promise<{ agents: readonly AgentFile[]; problems: readonly string[] }> {
  const agents: AgentFile[] = []
  const problems: string[] = []
  for (const plugin of plugins) {
    if (!plugin.active) continue
    for (const relative of plugin.manifest.agents ?? []) {
      try {
        const contents = await readFile(join(plugin.dir, relative), 'utf8')
        const name = `${plugin.manifest.id}-${agentStem(relative)}`
        agents.push({
          path: `${name}.md`,
          contents: resolvePluginDir(nameForFolder(contents, name), plugin.dir),
          source: plugin.manifest.id,
        })
      } catch (error) {
        problems.push(`${plugin.manifest.id}: ${(error as Error).message}`)
      }
    }
  }
  return { agents, problems }
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

**Creating a page: walk UP to the nearest folder that already exists, and use
its store.** The answer is on disk, one level up if not at hand.

That walk is the whole rule, and skipping it has a shape worth knowing.
Writing \`voyages/baden-2026/vannes.md\` into a shared trip is easy — the folder
is right there. Writing \`voyages/baden-2026/notes/carnet.md\` looks just as
easy, and it is not: \`notes/\` exists nowhere yet, so a rule that only checks
the immediate folder finds nothing and falls back to the default store. Half
the trip is then in a shared circle and half in a private one, nothing failed,
and the screen shows the reassuring half. One new sub-folder is all it takes.

**When several stores carry that folder: ASK which one.** This is the only
case nobody can deduce, and choosing silently files somebody's note in
somebody else's circle. Name the choices and let the person answer.

**Only a page whose folders exist NOWHERE goes to the default store** — a new
tree at the root. There, the default is a real answer rather than a shrug:
nothing on disk has an opinion yet.

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

/**
 * Every contract this instance delivers: the product's, its plugins', and the
 * two it composes from what the instance actually is.
 *
 * `facts` is optional so a caller that only wants the authoring contracts —
 * every test that predates the introduction, and any host with no instance to
 * describe — keeps working unchanged. Where it IS given, the shell introduces
 * itself: see `introduction.ts` for why that is generated rather than written.
 */
export async function collectSkills(
  plugins: readonly DiscoveredPlugin[],
  stores: readonly Store[] = [],
  facts?: InstanceFacts,
): Promise<{
  skills: readonly SkillFile[]
  agents: readonly AgentFile[]
  problems: readonly string[]
}> {
  const core = await readCoreSkills()
  const { skills: fromPlugins, problems } = await readPluginSkills(plugins)
  const { agents, problems: agentProblems } = await readPluginAgents(plugins)
  const composed = [
    ...(facts ? [instanceContract(facts)] : []),
    ...(stores.length > 1 ? [storesContract(stores)] : []),
  ]
  return { skills: [...core, ...fromPlugins, ...composed], agents, problems: [...problems, ...agentProblems] }
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
 * Stamps the marker where it cannot break the file it marks.
 *
 * Prefixing it to the whole file pushed the YAML frontmatter off the first
 * byte, and an engine that registers skills by reading that frontmatter then
 * registers NOTHING. Measured on copilot-cli 1.0.83, against a delivered
 * contract sitting in `.github/skills`: the agent asked for it by name and got
 * `Skill not found`, then spent five refused tool calls hunting the filesystem
 * before finding the file by hand. Moved one line down, the same file answers
 * `loaded successfully` on the first call.
 *
 * That was every contract this product delivers, not one of them — its own
 * four and every plugin's.
 *
 * After the frontmatter is also where a reader looks for it: the first line of
 * the body, before the prose it disclaims. Every consumer tests the marker with
 * `includes`, so nothing else has to learn where it moved.
 */
export function stamped(contents: string): string {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(contents)
  // No frontmatter to protect: the top is the only place left, and a file
  // without one was never going to be registered as a skill anyway.
  if (!frontmatter) return `${MANAGED_MARKER}\n${contents}`
  return `${frontmatter[0]}${MANAGED_MARKER}\n${contents.slice(frontmatter[0].length)}`
}

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
    const folder = dirname(target)
    // A managed folder is emptied before it is written, so a reference the
    // plugin dropped in its new version does not linger beside the skill that
    // stopped citing it. Ownership is read off `SKILL.md`, as for withdrawal:
    // a folder somebody wrote by hand is overwritten file by file, never wiped.
    const existing = await readFile(target, 'utf8').catch(() => '')
    if (existing.includes(MANAGED_MARKER)) await rm(folder, { recursive: true, force: true })
    await mkdir(folder, { recursive: true })
    await writeFile(target, stamped(skill.contents), 'utf8')
    for (const asset of skill.assets ?? []) {
      const path = join(folder, asset.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, asset.contents)
      await chmod(path, asset.mode)
    }
  }

  return { written: skills.length, removed }
}

/**
 * Writes plugin subagents into the CLI's own agents directory.
 *
 * The same ownership rule as skills, one level flatter: an agent is a file,
 * not a folder, and only a file carrying the marker is ever replaced or
 * removed. A hand-written agent that shares a delivered name is left alone and
 * reported, rather than overwritten — it is somebody's brief.
 */
export async function deliverAgents(
  agentsRoot: string,
  agents: readonly AgentFile[],
): Promise<{ written: number; removed: number; kept: readonly string[] }> {
  const root = resolve(agentsRoot)
  await mkdir(root, { recursive: true })

  const wanted = new Set(agents.map((agent) => agent.path))
  let removed = 0
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || wanted.has(entry.name)) continue
    const existing = await readFile(join(root, entry.name), 'utf8').catch(() => '')
    if (!existing.includes(MANAGED_MARKER)) continue
    await rm(join(root, entry.name), { force: true })
    removed += 1
  }

  let written = 0
  const kept: string[] = []
  for (const agent of agents) {
    const target = join(root, agent.path)
    const existing = await readFile(target, 'utf8').catch(() => undefined)
    if (existing !== undefined && !existing.includes(MANAGED_MARKER)) {
      kept.push(agent.path)
      continue
    }
    await writeFile(target, stamped(agent.contents), 'utf8')
    written += 1
  }
  return { written, removed, kept }
}
