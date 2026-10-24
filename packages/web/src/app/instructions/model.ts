/**
 * What the instruction zone is made of: the kinds, the shapes the server sends,
 * and the small pure functions that name, find and seed a file.
 */

/** When the engine reads a file — which is the same question as what it is. */
export type Kind = 'instruction' | 'skill' | 'agent'

export interface InstructionFile {
  readonly path: string
  readonly modified: string
  readonly bytes: number
  /** Delivered by the product or a plugin, and rewritten at every start. */
  readonly managed?: boolean
  /** From the zone the driver declared. Absent on an engine that says nothing. */
  readonly kind?: Kind
  /** The frontmatter `name` — the identifier the engine itself uses. */
  readonly name?: string
  /** The frontmatter `description` — what it is for, in its author's words. */
  readonly description?: string
  /** Imported from an instruction catalogue; absent on a local or plugin-delivered file. */
  readonly source?: { readonly catalogue: string; readonly repo: string; readonly ref: string }
}

/** A place an instruction may be written, as the driver declared it. */
export interface InstructionPath {
  readonly path: string
  /** The shape on disk. */
  readonly kind: 'file' | 'folder'
  /** What lives there. */
  readonly holds?: Kind
  /** Where a new one lands inside it, `<name>` standing for the slug. */
  readonly entry?: string
  readonly exists: boolean
}

/**
 * The order the groups are drawn in, which is the order of decreasing weight:
 * what is always read, then what may be read, then what another agent reads.
 */
export const KINDS: readonly Kind[] = ['instruction', 'skill', 'agent']

/**
 * What each group is called, and the one line that says when it is read.
 *
 * The heading is the engine's word; the line under it is the meaning, and the
 * meaning is what gets translated.
 */
export const GROUPS: Readonly<Record<Kind, { readonly title: string; readonly lede: string }>> = {
  instruction: {
    title: 'Instructions',
    lede: 'Read at the start of every turn, whatever it is about.',
  },
  skill: {
    title: 'Skills',
    lede: 'Read only when a task matches the description — free until one does.',
  },
  agent: {
    title: 'Agents',
    lede: 'A named helper the agent hands a job to, working from its own brief.',
  },
}

/**
 * What a new one is called on the button that creates it, and what the sheet
 * asks for.
 *
 * Singular, with the `+` doing the work "New" used to: "Nouvelle compétence"
 * forces a translation of a word that is on the folder and in the filename,
 * and "Nouveau skill" forces a gender onto a borrowed one. `+ Skill` sidesteps
 * both and reads the same in either language.
 */
export const NEW: Readonly<Record<Kind, { readonly label: string; readonly ask: string }>> = {
  instruction: { label: 'Instruction', ask: 'What is this instruction about?' },
  skill: { label: 'Skill', ask: 'What is this skill for?' },
  agent: { label: 'Agent', ask: 'What is this agent for?' },
}

export const kindOf = (file: InstructionFile): Kind => file.kind ?? 'instruction'

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** A folder name from a title somebody typed. */
export const slug = (name: string) =>
  fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/** The last segment, which is what tells two SKILL.md files apart. */
export function label(path: string): string {
  const parts = path.split('/')
  const last = parts.at(-1) ?? path
  return last.toUpperCase() === 'SKILL.MD' && parts.length > 1 ? (parts.at(-2) ?? last) : last
}

/**
 * What to call a file on its card.
 *
 * The frontmatter `name` wins over the filename because it is the identifier
 * the ENGINE uses: a subagent invoked as `code-reviewer` that happens to live
 * in `reviewer.agent.md` must be findable under the name it answers to. The
 * filename is the fallback, and for a plain `CLAUDE.md` it is the whole truth.
 */
export function title(file: InstructionFile): string {
  return file.name?.trim() || label(file.path)
}

/**
 * Whether a query matches a file.
 *
 * Over the path, the name and the description, because half of what
 * distinguishes two instructions is where they sit and what they are for — a
 * search that only read filenames would tell somebody looking for "the one
 * about invoices" that there is nothing there, with the word sitting in a
 * description three of them carry. Accent-folded, so `dietetique` finds
 * `diététique`.
 */
export function matches(file: InstructionFile, query: string): boolean {
  const wanted = fold(query.trim())
  if (wanted === '') return true
  return fold(`${file.path} ${file.name ?? ''} ${file.description ?? ''}`).includes(wanted)
}

/** `1420` → `1.4 kB`. Enough to tell a stub from a chapter, and no more. */
export function size(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

/**
 * The opening text of a new one.
 *
 * A skill and a subagent are found BY their frontmatter — an engine that
 * cannot read a `description` never matches the thing to a task, so a new one
 * without it is a file that exists and never runs. A standing instruction has
 * no such contract and gets none: it is read whole, every turn.
 */
export function seedFor(kind: Kind, id: string, name: string): string {
  if (kind === 'instruction') return `# ${name}\n\n`
  return `---\nname: ${id}\ndescription: ${name}\n---\n\n# ${name}\n\n`
}

/** The address of a file on the server. */
export const fileUrl = (path: string) =>
  `/api/instructions/${path.split('/').map(encodeURIComponent).join('/')}`
