/**
 * The instruction zone, as a screen.
 *
 * Plain text, deliberately, and this is a design position rather than a corner
 * cut. Pages go through a closed grammar with a validator, because a page is
 * rendered by this product and must stay inside a vocabulary the renderer
 * knows. An instruction is read by a CLI: its frontmatter, its code fences and
 * its exact whitespace are the CLI's business, and normalizing them through a
 * grammar built for something else would quietly rewrite a file whose meaning
 * lives in bytes we do not own. So it is saved exactly as typed.
 *
 * What is here is what a PERSON wrote. Contracts the product delivers into the
 * same folders are excluded by the server, because they are rewritten at every
 * start — offering to edit one would offer an edit that disappears.
 */

import { useCallback, useEffect, useState } from 'react'

interface InstructionFile {
  readonly path: string
  readonly modified: string
  readonly bytes: number
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

type Save = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; message: string }

/** The last segment, which is what tells two SKILL.md files apart. */
function label(path: string): string {
  const parts = path.split('/')
  const last = parts.at(-1) ?? path
  return last.toUpperCase() === 'SKILL.MD' && parts.length > 1 ? (parts.at(-2) ?? last) : last
}

export function Instructions({
  fetchImpl = fetch,
  t = (key) => key,
}: {
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}) {
  const [files, setFiles] = useState<readonly InstructionFile[] | undefined>()
  /** Where one may be written — the listing only says what is already there. */
  const [places, setPlaces] = useState<readonly InstructionPath[]>([])
  const [supported, setSupported] = useState(true)
  const [open, setOpen] = useState<string | undefined>()
  const [text, setText] = useState('')
  /** What was loaded, so Save lights up on a real change rather than on focus. */
  const [onDisk, setOnDisk] = useState('')
  const [save, setSave] = useState<Save>({ kind: 'idle' })

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

  const load = useCallback(
    async (path: string) => {
      setOpen(path)
      setSave({ kind: 'idle' })
      const response = await fetchImpl(`/api/instructions/${path.split('/').map(encodeURIComponent).join('/')}`)
      if (!response.ok) {
        setText('')
        setOnDisk('')
        return
      }
      const body = (await response.json()) as { markdown?: string }
      setText(body.markdown ?? '')
      setOnDisk(body.markdown ?? '')
    },
    [fetchImpl],
  )

  const start = useCallback(
    (path: string, seed = '') => {
      setOpen(path)
      setText(seed)
      // Not on disk yet, so anything typed is a change: Save lights up at the
      // first keystroke rather than waiting for a file that is not there.
      setOnDisk('')
      setSave({ kind: 'idle' })
      setFiles((current) =>
        current?.some((file) => file.path === path)
          ? current
          : [...(current ?? []), { path, modified: new Date().toISOString(), bytes: 0 }],
      )
    },
    [],
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
      setSave({ kind: 'saved' })
    } catch (error) {
      setSave({ kind: 'failed', message: (error as Error).message })
    }
  }, [fetchImpl, open, text])

  if (!supported) {
    return (
      <section className="demeura-empty">
        <p>{t('This engine keeps its instructions elsewhere.')}</p>
      </section>
    )
  }

  const dirty = text !== onDisk

  return (
    <section className="demeura-instructions">
      <header className="demeura-chead">
        <span className="demeura-chead__icon" aria-hidden="true">
          📓
        </span>
        <div>
          <h1 className="demeura-chead__title">{t('Instructions')}</h1>
          <p className="demeura-chead__lede">
            {t('What you have told the agent, in your words. Saved exactly as typed.')}
          </p>
        </div>
      </header>

      {files !== undefined && files.length === 0 && (
        <p className="demeura-instructions__empty">
          {t('Nothing here yet — write one, or ask the agent to.')}
        </p>
      )}

      {/*
        Where a first instruction can be written.
        
        Without this the screen was a dead end on a fresh instance: an empty
        list, and nothing to add to it. The places come from the driver — only
        it knows where its CLI reads prose — and the two shapes get the two
        controls they deserve: a named file is created as itself, a folder
        takes a name first.
      */}
      {places.length > 0 && (
        <div className="demeura-instructions__new">
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
      )}

      <div className="demeura-instructions__split">
        <ul className="demeura-instructions__list">
          {(files ?? []).map((file) => (
            <li key={file.path}>
              <button
                type="button"
                className={file.path === open ? 'is-open' : undefined}
                onClick={() => void load(file.path)}
              >
                <span className="demeura-instructions__name">{label(file.path)}</span>
                {/* Only when it adds something: for a file at the workspace
                    root the path IS the name, and printing both is noise. */}
                {file.path !== label(file.path) && (
                  <span className="demeura-instructions__path">{file.path}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {open !== undefined && (
          <div className="demeura-instructions__pane">
            <div className="demeura-instructions__bar">
              <code>{open}</code>
              <span style={{ flex: 1 }} />
              {save.kind === 'failed' && (
                <span className="demeura-save demeura-save--error" role="alert">
                  {save.message}
                </span>
              )}
              {save.kind === 'saved' && !dirty && <span className="demeura-save">{t('Saved')}</span>}
              <button type="button" onClick={() => void commit()} disabled={!dirty || save.kind === 'saving'}>
                {save.kind === 'saving' ? t('Saving…') : t('Save')}
              </button>
            </div>
            <textarea
              className="demeura-instructions__text"
              value={text}
              spellCheck={false}
              onChange={(event) => {
                setText(event.target.value)
                if (save.kind !== 'idle') setSave({ kind: 'idle' })
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
