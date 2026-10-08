/**
 * The way into instruction catalogues: a pop-in opened from Instructions.
 *
 * Two levels, one sheet. First the repositories declared (with a form to
 * declare one); entering one lists what its scan found, each item with its own
 * import gesture. The grain is the ITEM, never the repository.
 *
 * An item whose kind has no zone on the active driver is drawn all the same,
 * with its gesture disabled — the catalogue offers it even if this instance
 * cannot receive it, and hiding it would say the catalogue has nothing.
 *
 * Importing tells the screen behind (`onChanged`) so the global list is
 * re-read: the card appears without a page reload, from the one source of
 * truth rather than a copy kept here.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Catalogue {
  readonly id: string
  readonly repo: string
  readonly ref: string
  readonly imports: readonly unknown[]
}

interface Item {
  readonly itemPath: string
  readonly kind: 'instruction' | 'skill' | 'agent'
  readonly name?: string
  readonly description?: string
  readonly importable: boolean
  readonly imported: boolean
}

export interface CataloguePopinProps {
  readonly onClose: () => void
  /** Called after an import or a withdrawal, so the list behind re-reads. */
  readonly onChanged: () => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

const urlOf = (id: string, itemPath?: string) =>
  `/api/instruction-catalogues/${encodeURIComponent(id)}` +
  (itemPath === undefined ? '' : `/items/${itemPath.split('/').map(encodeURIComponent).join('/')}`)

async function failure(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return body.error ?? `request failed (${response.status})`
}

export function CataloguePopin({
  onClose,
  onChanged,
  fetchImpl = fetch,
  t = (key) => key,
}: CataloguePopinProps) {
  const [catalogues, setCatalogues] = useState<readonly Catalogue[] | undefined>()
  const [entered, setEntered] = useState<Catalogue | undefined>()
  const [items, setItems] = useState<readonly Item[] | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | undefined>()
  const [repo, setRepo] = useState('')
  const [ref, setRef] = useState('main')
  const [token, setToken] = useState('')

  const loadCatalogues = useCallback(async () => {
    const response = await fetchImpl('/api/instruction-catalogues')
    if (!response.ok) return setError(await failure(response))
    const body = (await response.json()) as { catalogues?: readonly Catalogue[] }
    setCatalogues(body.catalogues ?? [])
  }, [fetchImpl])

  const loadItems = useCallback(
    async (catalogue: Catalogue) => {
      setItems(undefined)
      const response = await fetchImpl(`${urlOf(catalogue.id)}/items`)
      if (!response.ok) {
        setItems([])
        return setError(await failure(response))
      }
      const body = (await response.json()) as { items?: readonly Item[] }
      setItems(body.items ?? [])
    },
    [fetchImpl],
  )

  useEffect(() => {
    void loadCatalogues()
  }, [loadCatalogues])

  const add = async () => {
    setError(undefined)
    const response = await fetchImpl('/api/instruction-catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repo: repo.trim(),
        ref: ref.trim(),
        ...(token.trim() !== '' ? { token: token.trim() } : {}),
      }),
    })
    if (!response.ok) return setError(await failure(response))
    setRepo('')
    setToken('')
    await loadCatalogues()
  }

  const enter = (catalogue: Catalogue) => {
    setError(undefined)
    setEntered(catalogue)
    void loadItems(catalogue)
  }

  const toggle = async (catalogue: Catalogue, item: Item) => {
    setError(undefined)
    setBusy(item.itemPath)
    try {
      const response = await fetchImpl(urlOf(catalogue.id, item.itemPath), {
        method: item.imported ? 'DELETE' : 'PUT',
      })
      if (!response.ok) return setError(await failure(response))
      await loadItems(catalogue)
      onChanged()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  // Portalled to the body, like the other sheets: the shell folds panes with
  // transforms on a phone, and a fixed element inside one is fixed to THAT.
  return createPortal(
    <div className="adestia-sheet" onClick={onClose}>
      <div
        className="adestia-sheet__panel adestia-catalogues"
        role="dialog"
        aria-modal="true"
        aria-label={t('Catalogues')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="adestia-sheet__head">
          {entered && (
            <button
              type="button"
              className="adestia-sheet__tab"
              onClick={() => {
                setEntered(undefined)
                setError(undefined)
                void loadCatalogues()
              }}
            >
              ← {t('Catalogues')}
            </button>
          )}
          <span className="adestia-sheet__origin">{entered ? entered.id : t('Catalogues')}</span>
          <button type="button" className="adestia-sheet__close" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="adestia-catalogues__body">
          {error && (
            <p className="adestia-save adestia-save--error" role="alert">
              {error}
            </p>
          )}

          {!entered && (
            <>
              {catalogues?.length === 0 && (
                <p className="adestia-instructions__empty">
                  {t('No catalogue yet — add a repository of instructions.')}
                </p>
              )}
              <ul className="adestia-catalogues__list">
                {(catalogues ?? []).map((catalogue) => (
                  <li key={catalogue.id}>
                    <button type="button" className="adestia-filecard" onClick={() => enter(catalogue)}>
                      <span className="adestia-filecard__name">{catalogue.id}</span>
                      <span className="adestia-filecard__path">
                        {catalogue.repo} @ {catalogue.ref}
                      </span>
                      <span className="adestia-filecard__foot">
                        <span>
                          {catalogue.imports.length} {t('imported')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="adestia-catalogues__add"
                onSubmit={(event) => {
                  event.preventDefault()
                  void add()
                }}
              >
                <input
                  value={repo}
                  placeholder={t('Repository address')}
                  aria-label={t('Repository address')}
                  onChange={(event) => setRepo(event.target.value)}
                />
                <input
                  value={ref}
                  placeholder={t('Ref')}
                  aria-label={t('Ref')}
                  onChange={(event) => setRef(event.target.value)}
                />
                <input
                  type="password"
                  value={token}
                  placeholder={t('Token (optional)')}
                  aria-label={t('Token (optional)')}
                  autoComplete="off"
                  onChange={(event) => setToken(event.target.value)}
                />
                <button type="submit" disabled={repo.trim() === '' || ref.trim() === ''}>
                  {t('Add')}
                </button>
              </form>
            </>
          )}

          {entered && (
            <>
              {items === undefined && <p className="adestia-instructions__empty">{t('Reading the repository…')}</p>}
              {items?.length === 0 && !error && (
                <p className="adestia-instructions__empty">{t('Nothing importable found here.')}</p>
              )}
              <ul className="adestia-catalogues__list">
                {(items ?? []).map((item) => (
                  <li key={item.itemPath} className="adestia-catalogues__item">
                    <div className="adestia-catalogues__text">
                      <span className="adestia-filecard__head">
                        <span className="adestia-filecard__name">
                          {item.name?.trim() || item.itemPath.split('/').at(-1)}
                        </span>
                        <span className="adestia-filecard__badge">{item.kind}</span>
                      </span>
                      {item.description && (
                        <span className="adestia-filecard__about">{item.description}</span>
                      )}
                      <span className="adestia-filecard__path">{item.itemPath}</span>
                    </div>
                    <button
                      type="button"
                      disabled={(!item.importable && !item.imported) || busy === item.itemPath}
                      title={
                        item.importable || item.imported
                          ? undefined
                          : t('The active engine has no place for this kind.')
                      }
                      aria-label={`${item.imported ? t('Remove') : t('Import')} ${item.name?.trim() || item.itemPath}`}
                      onClick={() => void toggle(entered, item)}
                    >
                      {item.imported ? t('Remove') : t('Import')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
