/**
 * The instruction zone, as a screen you can browse.
 *
 * Plain text, deliberately, and this is a design position rather than a corner
 * cut. Pages go through a closed grammar with a validator, because a page is
 * rendered by this product and must stay inside a vocabulary the renderer
 * knows. An instruction is read by a CLI: its frontmatter, its code fences and
 * its exact whitespace are the CLI's business, and normalizing them through a
 * grammar built for something else would quietly rewrite a file whose meaning
 * lives in bytes we do not own. So it is saved exactly as typed.
 *
 * Three things changed the day this stopped being a list beside a box.
 *
 * **A card per instruction, and a field to search them.** The split pane was
 * built for the four files a fresh instance has. A real one has thirty — a
 * driver's own conventions, a folder of skills, whatever somebody asked the
 * agent to write down — and a column of file names is unreadable at thirty
 * and unusable at a hundred.
 *
 * **What the product delivers is SHOWN, and cannot be saved.** It used to be
 * filtered out entirely, which meant the screen answered "what is this agent
 * reading?" with half the truth — on an instance whose behaviour comes mostly
 * from plugin contracts, somebody hunting for the rule that made the agent do
 * something could not find it, because it was not theirs. So it is here, said
 * to be delivered, and drawn without a Save. The server refuses the write in
 * any case: an edit that the next restart throws away is worth refusing twice.
 *
 * **And the cards are GROUPED by when the engine reads them.** Thirty cards
 * in one grid gave a standing brief, a skill nothing has matched yet and a
 * subagent's charter exactly the same weight, when the difference between
 * them is the first thing anybody needs: `CLAUDE.md` is in front of the model
 * on every turn, a skill is not there until a task fits its description. The
 * group headings keep the ENGINE's own words — `skills`, `agents` — because
 * those words are on the folder and in the file the reader is about to open,
 * and a translated heading over an untranslated path is one more thing to
 * reconcile. The line under each heading carries the meaning, and it IS
 * translated.
 *
 * A group with nothing in it does not draw: Codex has skills and no subagent
 * folder, and a heading over an empty list reads as a feature that is broken
 * rather than one this engine does not have. Neither do the headings when
 * only one group has anything — on a fresh instance that is a lone
 * `CLAUDE.md` under a heading repeating the screen's own title.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

/** When the engine reads a file — which is the same question as what it is. */
type Kind = 'instruction' | 'skill' | 'agent'

interface InstructionFile {
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
}

/** A place an instruction may be written, as the driver declared it. */
interface InstructionPath {
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
const KINDS: readonly Kind[] = ['instruction', 'skill', 'agent']

/**
 * What each group is called, and the one line that says when it is read.
 *
 * The heading is the engine's word; the line under it is the meaning, and the
 * meaning is what gets translated.
 */
const GROUPS: Readonly<Record<Kind, { readonly title: string; readonly lede: string }>> = {
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
 * What a new one is called on the button that creates it, and what the prompt
 * asks for.
 *
 * Singular, with the `+` doing the work "New" used to: "Nouvelle compétence"
 * forces a translation of a word that is on the folder and in the filename,
 * and "Nouveau skill" forces a gender onto a borrowed one. `+ Skill` sidesteps
 * both and reads the same in either language.
 */
const NEW: Readonly<Record<Kind, { readonly label: string; readonly ask: string }>> = {
  instruction: { label: 'Instruction', ask: 'What is this instruction about?' },
  skill: { label: 'Skill', ask: 'What is this skill for?' },
  agent: { label: 'Agent', ask: 'What is this agent for?' },
}

const kindOf = (file: InstructionFile): Kind => file.kind ?? 'instruction'

/** A folder name from a title somebody typed. */
const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

type Save = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; message: string }

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
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  const wanted = fold(query.trim())
  if (wanted === '') return true
  return fold(`${file.path} ${file.name ?? ''} ${file.description ?? ''}`).includes(wanted)
}

/** `1420` → `1.4 kB`. Enough to tell a stub from a chapter, and no more. */
function size(bytes: number): string {
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
function seedFor(kind: Kind, id: string, name: string): string {
  if (kind === 'instruction') return `# ${name}\n\n`
  return `---\nname: ${id}\ndescription: ${name}\n---\n\n# ${name}\n\n`
}

export interface InstructionsProps {
  /** The instruction whose text is open, from the address. */
  readonly open?: string | undefined
  readonly onOpen: (path: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
  readonly locale?: string
}

export function Instructions({
  open,
  onOpen,
  fetchImpl = fetch,
  t = (key) => key,
  locale,
}: InstructionsProps) {
  const [files, setFiles] = useState<readonly InstructionFile[] | undefined>()
  /** Where one may be written — the listing only says what is already there. */
  const [places, setPlaces] = useState<readonly InstructionPath[]>([])
  const [supported, setSupported] = useState(true)
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  /** What was loaded, so Save lights up on a real change rather than on focus. */
  const [onDisk, setOnDisk] = useState('')
  const [save, setSave] = useState<Save>({ kind: 'idle' })
  /**
   * A file being written for the first time, and its opening text.
   *
   * Held here rather than fetched: there is nothing on disk to fetch yet, and
   * a 404 on the way in would blank the very seed that makes a new skill a
   * skill instead of an empty box.
   */
  const [seed, setSeed] = useState<{ path: string; text: string; kind: Kind } | undefined>()

  useEffect(() => {
    void (async () => {
      const response = await fetchImpl('/api/instructions')
      // 404 means this engine has no such concept — a different fact from
      // "you have written none", and the screen must not offer an editor for
      // a zone that does not exist.
      if (response.status === 404) {
        setSupported(false)
        return
      }
      if (!response.ok) return
      const body = (await response.json()) as {
        files?: readonly InstructionFile[]
        paths?: readonly InstructionPath[]
      }
      setFiles(body.files ?? [])
      setPlaces(body.paths ?? [])
    })()
  }, [fetchImpl])

  /** The text of whatever the address names, seeded or fetched. */
  useEffect(() => {
    if (open === undefined) return undefined
    if (seed?.path === open) {
      setText(seed.text)
      // Not on disk yet, so anything typed is a change: Save lights up at the
      // first keystroke rather than waiting for a file that is not there.
      setOnDisk('')
      setSave({ kind: 'idle' })
      return undefined
    }
    let live = true
    setSave({ kind: 'idle' })
    void (async () => {
      const response = await fetchImpl(
        `/api/instructions/${open.split('/').map(encodeURIComponent).join('/')}`,
      )
      if (!live) return
      if (!response.ok) {
        setText('')
        setOnDisk('')
        return
      }
      const body = (await response.json()) as { markdown?: string }
      setText(body.markdown ?? '')
      setOnDisk(body.markdown ?? '')
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, open, seed])

  const start = useCallback(
    (path: string, kind: Kind, text = '') => {
      setSeed({ path, text, kind })
      setFiles((current) =>
        current?.some((file) => file.path === path)
          ? current
          : [...(current ?? []), { path, modified: new Date().toISOString(), bytes: 0, kind }],
      )
      onOpen(path)
    },
    [onOpen],
  )

  const commit = useCallback(async () => {
    if (!open) return
    setSave({ kind: 'saving' })
    try {
      const response = await fetchImpl(
        `/api/instructions/${open.split('/').map(encodeURIComponent).join('/')}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: text }),
        },
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setSave({ kind: 'failed', message: body.error ?? `save failed (${response.status})` })
        return
      }
      setOnDisk(text)
      setSeed(undefined)
      setSave({ kind: 'saved' })
    } catch (error) {
      setSave({ kind: 'failed', message: (error as Error).message })
    }
  }, [fetchImpl, open, text])

  const found = useMemo(
    () => (files ?? []).filter((file) => matches(file, query)),
    [files, query],
  )

  /** Only the groups that have something in them, in their settled order. */
  const groups = useMemo(
    () =>
      KINDS.map((kind) => ({ kind, files: found.filter((file) => kindOf(file) === kind) })).filter(
        (group) => group.files.length > 0,
      ),
    [found],
  )

  if (!supported) {
    return (
      <section className="adestia-empty">
        <p>{t('This engine keeps its instructions elsewhere.')}</p>
      </section>
    )
  }

  if (open !== undefined) {
    const shown = files?.find((file) => file.path === open)
    const managed = shown?.managed === true
    const kind = shown ? kindOf(shown) : 'instruction'
    const dirty = text !== onDisk

    return (
      <section className="adestia-instructions">
        {/* No back button of its own: the shell draws one, and it climbs one
            level. Two of them stacked is what this screen shipped with. */}
        <header className="adestia-chead">
          <span className="adestia-chead__icon" aria-hidden="true">
            📓
          </span>
          <div>
            <h1 className="adestia-chead__title">{shown ? title(shown) : label(open)}</h1>
            {/* What it is, and therefore when the engine reads it — said here
                because somebody arriving by a link never saw the card that
                would have told them. */}
            <p className="adestia-chead__lede">{t(GROUPS[kind].lede)}</p>
            {/* The address, only when it adds something: for a file at the
                workspace root the path IS the name. Same rule as the card. */}
            {open !== (shown ? title(shown) : label(open)) && (
              <p className="adestia-instructions__where">
                <code>{open}</code>
              </p>
            )}
          </div>
        </header>

        {managed && (
          <p className="adestia-instructions__delivered">
            {t('Delivered with the product and rewritten at every start — shown, not edited.')}
          </p>
        )}

        <div className="adestia-instructions__pane">
          {!managed && (
            <div className="adestia-instructions__bar">
              <span style={{ flex: 1 }} />
              {save.kind === 'failed' && (
                <span className="adestia-save adestia-save--error" role="alert">
                  {save.message}
                </span>
              )}
              {save.kind === 'saved' && !dirty && <span className="adestia-save">{t('Saved')}</span>}
              <button
                type="button"
                onClick={() => void commit()}
                disabled={!dirty || save.kind === 'saving'}
              >
                {save.kind === 'saving' ? t('Saving…') : t('Save')}
              </button>
            </div>
          )}
          <textarea
            className="adestia-instructions__text"
            value={text}
            spellCheck={false}
            readOnly={managed}
            aria-label={shown ? title(shown) : label(open)}
            onChange={(event) => {
              setText(event.target.value)
              if (save.kind !== 'idle') setSave({ kind: 'idle' })
            }}
          />
        </div>
      </section>
    )
  }

  /**
   * Folders, in the order the groups below are drawn in.
   *
   * Not the driver's declaration order, which put `+ Agent` before `+ Skill`
   * under a screen listing skills before agents — a small thing, and exactly
   * the kind that makes a row of buttons feel unsorted.
   */
  const folders = places
    .filter((place) => place.kind === 'folder')
    .slice()
    .sort((a, b) => KINDS.indexOf(a.holds ?? 'instruction') - KINDS.indexOf(b.holds ?? 'instruction'))

  return (
    <div className="adestia-instructions">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-bleu, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          📓
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Instructions')}</h1>
          <p className="adestia-chead__lede">
            {t('What you have told the agent, in your words. Saved exactly as typed.')}
          </p>
        </div>
      </header>

      <div className="adestia-instructions__tools">
        {/* Drawn from two files up: a field that appears at some threshold is
            a field nobody knows is there below it. */}
        <input
          type="search"
          className="adestia-instructions__search"
          value={query}
          placeholder={t('Search instructions')}
          aria-label={t('Search instructions')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/*
          Where a first instruction can be written.

          Without this the screen was a dead end on a fresh instance: an empty
          list, and nothing to add to it. The places come from the driver —
          only it knows where its CLI reads prose — and the two shapes get the
          two controls they deserve: a named file is created as itself, a
          folder takes a name first.
        */}
        {places
          .filter((place) => place.kind === 'file' && !place.exists)
          .map((place) => (
            <button
              key={place.path}
              type="button"
              onClick={() => start(place.path, place.holds ?? 'instruction')}
            >
              + {place.path}
            </button>
          ))}
        {folders.map((place) => {
          const holds = place.holds ?? 'instruction'
          // Codex declares TWO skill folders. One button per folder, both
          // reading "+ Skill", would be two identical controls landing in
          // different places — so the path joins the label when, and only
          // when, it is what tells them apart. In ONE string rather than a
          // styled span beside it: a name split across elements is read back
          // without the space between them, by a screen reader and by the
          // test that stands in for one.
          const ambiguous = folders.filter((other) => (other.holds ?? 'instruction') === holds)
          return (
            <button
              key={place.path}
              type="button"
              onClick={() => {
                const name = window.prompt(t(NEW[holds].ask))
                const id = slug(name ?? '')
                if (!id) return
                // The driver said where a new one goes; the client inventing
                // it is how a subagent ended up at `agents/x/SKILL.md`, a
                // file no engine opens.
                const entry = place.entry ?? '<name>/SKILL.md'
                start(
                  `${place.path}/${entry.replace('<name>', id)}`,
                  holds,
                  seedFor(holds, id, name ?? id),
                )
              }}
            >
              {ambiguous.length > 1
                ? `+ ${t(NEW[holds].label)} · ${place.path}`
                : `+ ${t(NEW[holds].label)}`}
            </button>
          )
        })}
      </div>

      {files !== undefined && files.length === 0 && (
        <p className="adestia-instructions__empty">
          {t('Nothing here yet — write one, or ask the agent to.')}
        </p>
      )}
      {files !== undefined && files.length > 0 && groups.length === 0 && (
        <p className="adestia-instructions__empty">{t('Nothing matches that.')}</p>
      )}

      {groups.map((group) => (
        <section key={group.kind} className="adestia-igroup">
          {/* A lone group repeats the screen's own title and says nothing —
              it earns its heading only once there is something to tell it
              apart from. */}
          {groups.length > 1 && (
            <header className="adestia-igroup__head">
              <h2 className="adestia-igroup__title">{t(GROUPS[group.kind].title)}</h2>
              <p className="adestia-igroup__lede">{t(GROUPS[group.kind].lede)}</p>
            </header>
          )}
          <ul className="adestia-filecards">
            {group.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  className="adestia-filecard"
                  onClick={() => onOpen(file.path)}
                >
                  <span className="adestia-filecard__head">
                    <span className="adestia-filecard__name">{title(file)}</span>
                    {file.managed && (
                      <span className="adestia-filecard__badge">{t('delivered')}</span>
                    )}
                  </span>
                  {/* What it is FOR — the sentence its author wrote, and for
                      a skill the very one the engine matches a task against.
                      It is what tells two SKILL.md files apart before either
                      is opened, which a byte count never did. */}
                  {file.description && (
                    <span className="adestia-filecard__about">{file.description}</span>
                  )}
                  {/* Only when it adds something: for a file at the workspace
                      root the path IS the name, and printing both is noise. */}
                  {file.path !== title(file) && (
                    <span className="adestia-filecard__path">{file.path}</span>
                  )}
                  <span className="adestia-filecard__foot">
                    <span>{size(file.bytes)}</span>
                    <span>{new Date(file.modified).toLocaleDateString(locale)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
