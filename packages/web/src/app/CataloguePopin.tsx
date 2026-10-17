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

import { useCallback, useEffect, useRef, useState } from 'react'

import { Icon } from './Icon.js'
import { jsonInit, requestJson } from './request.js'
import { Button, EmptyState, Field, Sheet } from './ui/index.js'

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
  // `t` defaults to a fresh function each render: a dependency of the loaders
  // would re-run their effect forever, so they read the latest through a ref.
  const tRef = useRef(t)
  tRef.current = t
  const say = useCallback((key: string) => tRef.current(key), [])

  const loadCatalogues = useCallback(async () => {
    const result = await requestJson<{ catalogues?: readonly Catalogue[] }>(
      fetchImpl,
      '/api/instruction-catalogues',
      undefined,
      say,
    )
    if (!result.ok) return setError(result.error)
    setCatalogues(result.data?.catalogues ?? [])
  }, [fetchImpl, say])

  const loadItems = useCallback(
    async (catalogue: Catalogue) => {
      setItems(undefined)
      const result = await requestJson<{ items?: readonly Item[] }>(
        fetchImpl,
        `${urlOf(catalogue.id)}/items`,
        undefined,
        say,
      )
      if (!result.ok) {
        setItems([])
        return setError(result.error)
      }
      setItems(result.data?.items ?? [])
    },
    [fetchImpl, say],
  )

  useEffect(() => {
    void loadCatalogues()
  }, [loadCatalogues])

  const add = async () => {
    setError(undefined)
    const result = await requestJson(
      fetchImpl,
      '/api/instruction-catalogues',
      jsonInit('POST', {
        repo: repo.trim(),
        ref: ref.trim(),
        ...(token.trim() !== '' ? { token: token.trim() } : {}),
      }),
      say,
    )
    if (!result.ok) return setError(result.error)
    setRepo('')
    setToken('')
    await loadCatalogues()
  }

  const enter = (catalogue: Catalogue) => {
    setError(undefined)
    setEntered(catalogue)
    void loadItems(catalogue)
  }

  /** Re-fetch the repository and re-copy what was imported from it, then re-read. */
  const refresh = async (catalogue: Catalogue) => {
    setError(undefined)
    setBusy('refresh')
    try {
      const result = await requestJson<{ missing?: readonly string[] }>(
        fetchImpl,
        `${urlOf(catalogue.id)}/refresh`,
        jsonInit('POST'),
        say,
      )
      if (!result.ok) return setError(result.error)
      const missing = result.data?.missing
      if (missing && missing.length > 0) {
        setError(`${t('No longer offered upstream, left as is:')} ${missing.join(', ')}`)
      }
      await loadItems(catalogue)
      onChanged()
    } finally {
      setBusy(undefined)
    }
  }

  const toggle = async (catalogue: Catalogue, item: Item) => {
    setError(undefined)
    setBusy(item.itemPath)
    try {
      const result = await requestJson(
        fetchImpl,
        urlOf(catalogue.id, item.itemPath),
        jsonInit(item.imported ? 'DELETE' : 'PUT'),
        say,
      )
      if (!result.ok) return setError(result.error)
      await loadItems(catalogue)
      onChanged()
    } finally {
      setBusy(undefined)
    }
  }

  const back = () => {
    setEntered(undefined)
    setError(undefined)
    void loadCatalogues()
  }

  // The shared sheet portals to the body: the shell folds panes with
  // transforms on a phone, and a fixed element inside one is fixed to THAT.
  // It also brings Escape, the focus trap, and the focus back to "Catalogues".
  return (
    <Sheet open title={entered ? entered.id : t('Catalogues')} onClose={onClose} className="adestia-catalogues" t={t}>
      <div className="adestia-catalogues__body">
        {entered && (
          <Button variant="ghost" small icon="chevron-left" className="adestia-catalogues__back" onClick={back}>
            {t('Catalogues')}
          </Button>
        )}
        {error && (
          <p className="adestia-save adestia-save--error" role="alert">
            <Icon name="circle-alert" />
            {error}
          </p>
        )}
        {!entered && (
          <CatalogueList
            catalogues={catalogues}
            repo={repo}
            ref_={ref}
            token={token}
            onRepo={setRepo}
            onRef={setRef}
            onToken={setToken}
            onEnter={enter}
            onAdd={() => void add()}
            t={t}
          />
        )}
        {entered && (
          <CatalogueItems
            items={items}
            error={error}
            busy={busy}
            onRefresh={() => void refresh(entered)}
            onToggle={(item) => void toggle(entered, item)}
            t={t}
          />
        )}
      </div>
    </Sheet>
  )
}

interface ListProps {
  readonly catalogues: readonly Catalogue[] | undefined
  readonly repo: string
  readonly ref_: string
  readonly token: string
  readonly onRepo: (value: string) => void
  readonly onRef: (value: string) => void
  readonly onToken: (value: string) => void
  readonly onEnter: (catalogue: Catalogue) => void
  readonly onAdd: () => void
  readonly t: (key: string) => string
}

/** The repositories declared, and the form to declare one. */
function CatalogueList(props: ListProps) {
  const { catalogues, repo, ref_, token, t } = props
  return (
    <>
      {catalogues?.length === 0 && (
        <EmptyState icon="book-open" text={t('No catalogue yet — add a repository of instructions.')} />
      )}
      <ul className="adestia-catalogues__list">
        {(catalogues ?? []).map((catalogue) => (
          <li key={catalogue.id}>
            <button type="button" className="adestia-filecard" onClick={() => props.onEnter(catalogue)}>
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
          props.onAdd()
        }}
      >
        <Field label={t('Repository address')}>
          <input className="adestia-input" placeholder={t('Repository address')} value={repo} onChange={(event) => props.onRepo(event.target.value)} />
        </Field>
        <Field label={t('Ref')}>
          <input className="adestia-input" placeholder={t('Ref')} value={ref_} onChange={(event) => props.onRef(event.target.value)} />
        </Field>
        <Field label={t('Token (optional)')}>
          <input
            className="adestia-input"
            type="password"
            placeholder={t('Token (optional)')}
            value={token}
            autoComplete="off"
            onChange={(event) => props.onToken(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="accent" icon="plus" disabled={repo.trim() === '' || ref_.trim() === ''}>
          {t('Add')}
        </Button>
      </form>
    </>
  )
}

interface ItemsProps {
  readonly items: readonly Item[] | undefined
  readonly error: string | undefined
  readonly busy: string | undefined
  readonly onRefresh: () => void
  readonly onToggle: (item: Item) => void
  readonly t: (key: string) => string
}

/** What one repository's scan found, an import gesture on each. */
function CatalogueItems({ items, error, busy, onRefresh, onToggle, t }: ItemsProps) {
  return (
    <>
      <Button icon="refresh-cw" disabled={busy === 'refresh'} busy={busy === 'refresh'} onClick={onRefresh}>
        {t('Refresh')}
      </Button>
      {items === undefined && <p className="adestia-instructions__empty">{t('Reading the repository…')}</p>}
      {items?.length === 0 && !error && (
        <EmptyState icon="search" text={t('Nothing importable found here.')} />
      )}
      <ul className="adestia-catalogues__list">
        {(items ?? []).map((item) => {
          const name = item.name?.trim() || item.itemPath.split('/').at(-1)
          return (
            <li key={item.itemPath} className="adestia-catalogues__item">
              <div className="adestia-catalogues__text">
                <span className="adestia-filecard__head">
                  <span className="adestia-filecard__name">{name}</span>
                  <span className="adestia-filecard__badge">{item.kind}</span>
                </span>
                {item.description && <span className="adestia-filecard__about">{item.description}</span>}
                <span className="adestia-filecard__path">{item.itemPath}</span>
              </div>
              <Button
                small
                variant={item.imported ? 'neutral' : 'accent'}
                icon={item.imported ? 'trash-2' : 'plus'}
                disabled={(!item.importable && !item.imported) || busy === item.itemPath}
                title={
                  item.importable || item.imported ? undefined : t('The active engine has no place for this kind.')
                }
                aria-label={`${item.imported ? t('Remove') : t('Import')} ${item.name?.trim() || item.itemPath}`}
                onClick={() => onToggle(item)}
              >
                {item.imported ? t('Remove') : t('Import')}
              </Button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
