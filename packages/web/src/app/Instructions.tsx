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
      const body = (await response.json()) as { files?: readonly InstructionFile[] }
      setFiles(body.files ?? [])
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
      <section className="golem-empty">
        <p>{t('This engine keeps its instructions elsewhere.')}</p>
      </section>
    )
  }

  const dirty = text !== onDisk

  return (
    <section className="golem-instructions">
      <header className="golem-chead">
        <span className="golem-chead__icon" aria-hidden="true">
          📓
        </span>
        <div>
          <h1 className="golem-chead__title">{t('Instructions')}</h1>
          <p className="golem-chead__lede">
            {t('What you have told the agent, in your words. Saved exactly as typed.')}
          </p>
        </div>
      </header>

      {files !== undefined && files.length === 0 && (
        <p className="golem-instructions__empty">
          {t('Nothing here yet — ask the agent to write down how you want it to work.')}
        </p>
      )}

      <div className="golem-instructions__split">
        <ul className="golem-instructions__list">
          {(files ?? []).map((file) => (
            <li key={file.path}>
              <button
                type="button"
                className={file.path === open ? 'is-open' : undefined}
                onClick={() => void load(file.path)}
              >
                <span className="golem-instructions__name">{label(file.path)}</span>
                {/* Only when it adds something: for a file at the workspace
                    root the path IS the name, and printing both is noise. */}
                {file.path !== label(file.path) && (
                  <span className="golem-instructions__path">{file.path}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {open !== undefined && (
          <div className="golem-instructions__pane">
            <div className="golem-instructions__bar">
              <code>{open}</code>
              <span style={{ flex: 1 }} />
              {save.kind === 'failed' && (
                <span className="golem-save golem-save--error" role="alert">
                  {save.message}
                </span>
              )}
              {save.kind === 'saved' && !dirty && <span className="golem-save">{t('Saved')}</span>}
              <button type="button" onClick={() => void commit()} disabled={!dirty || save.kind === 'saving'}>
                {save.kind === 'saving' ? t('Saving…') : t('Save')}
              </button>
            </div>
            <textarea
              className="golem-instructions__text"
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
