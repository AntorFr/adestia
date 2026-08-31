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
 * Two things changed the day this stopped being a list beside a box.
 *
 * **A card per instruction, and a field to search them.** The split pane was
 * built for the four files a fresh instance has. A real one has thirty — a
 * driver's own conventions, a folder of skills, whatever somebody asked the
 * agent to write down — and a column of file names is unreadable at thirty
 * and unusable at a hundred. A card can carry what tells two SKILL.md files
 * apart before you open either: the name, where it sits, how long it is.
 *
 * **What the product delivers is SHOWN, and cannot be saved.** It used to be
 * filtered out entirely, which meant the screen answered "what is this agent
 * reading?" with half the truth — on an instance whose behaviour comes mostly
 * from plugin contracts, somebody hunting for the rule that made the agent do
 * something could not find it, because it was not theirs. So it is here, said
 * to be delivered, and drawn without a Save. The server refuses the write in
 * any case: an edit that the next restart throws away is worth refusing twice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

interface InstructionFile {
  readonly path: string
  readonly modified: string
  readonly bytes: number
  /** Delivered by the product or a plugin, and rewritten at every start. */
  readonly managed?: boolean
}

/** A place an instruction may be written, as the driver declared it. */
interface InstructionPath {
  readonly path: string
  readonly kind: 'file' | 'folder'
  readonly exists: boolean
}

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
 * Whether a query matches a file.
 *
 * Over the path as well as the name, because half of what distinguishes two
 * instructions is where they sit — a search that only read names would tell
 * somebody looking for "the todo plugin's" one that there is nothing there.
 * Accent-folded, so `dietetique` finds `diététique`.
 */
export function matches(file: InstructionFile, query: string): boolean {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  const wanted = fold(query.trim())
  if (wanted === '') return true
  return fold(file.path).includes(wanted)
}

/** `1420` → `1.4 kB`. Enough to tell a stub from a chapter, and no more. */
function size(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
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
  const [seed, setSeed] = useState<{ path: string; text: string } | undefined>()

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
    (path: string, text = '') => {
      setSeed({ path, text })
      setFiles((current) =>
        current?.some((file) => file.path === path)
          ? current
          : [...(current ?? []), { path, modified: new Date().toISOString(), bytes: 0 }],
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
            <h1 className="adestia-chead__title">{label(open)}</h1>
            {/* Only when it adds something — for a file at the workspace root
                the path IS the name, and printing both twice is noise. Same
                rule as the card. */}
            {open !== label(open) && (
              <p className="adestia-chead__lede">
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
            aria-label={label(open)}
            onChange={(event) => {
              setText(event.target.value)
              if (save.kind !== 'idle') setSave({ kind: 'idle' })
            }}
          />
        </div>
      </section>
    )
  }

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
            <button key={place.path} type="button" onClick={() => start(place.path)}>
              + {place.path}
            </button>
          ))}
        {places
          .filter((place) => place.kind === 'folder')
          .map((place) => (
            <button
              key={place.path}
              type="button"
              onClick={() => {
                const name = window.prompt(t('What is this instruction about?'))
                const id = slug(name ?? '')
                if (!id) return
                start(
                  `${place.path}/${id}/SKILL.md`,
                  `---\nname: ${id}\ndescription: ${name}\n---\n\n# ${name}\n\n`,
                )
              }}
            >
              + {t('New instruction')}
            </button>
          ))}
      </div>

      {files !== undefined && files.length === 0 && (
        <p className="adestia-instructions__empty">
          {t('Nothing here yet — write one, or ask the agent to.')}
        </p>
      )}
      {files !== undefined && files.length > 0 && found.length === 0 && (
        <p className="adestia-instructions__empty">{t('Nothing matches that.')}</p>
      )}

      <ul className="adestia-cards">
        {found.map((file) => (
          <li key={file.path}>
            <button type="button" className="adestia-card" onClick={() => onOpen(file.path)}>
              <span className="adestia-card__head">
                <span className="adestia-card__name">{label(file.path)}</span>
                {file.managed && (
                  <span className="adestia-card__badge">{t('delivered')}</span>
                )}
              </span>
              {/* Only when it adds something: for a file at the workspace
                  root the path IS the name, and printing both is noise. */}
              {file.path !== label(file.path) && (
                <span className="adestia-card__path">{file.path}</span>
              )}
              <span className="adestia-card__foot">
                <span>{size(file.bytes)}</span>
                <span>{new Date(file.modified).toLocaleDateString(locale)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
