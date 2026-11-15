/**
 * New from template (E-3's button and E-36's sheet).
 *
 * The page is an ordinary page write: `PUT /api/pages/<folder>/<slug>.md`, no
 * revision, so a file already there answers `409` and nothing is overwritten.
 * The index says the same thing earlier (the logical path across every store),
 * and the `409` covers the index being stale.
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { Button, Failure, Field, Loading, Sheet } from './ui/index.js'
import type { Locale } from './i18n.js'
import { encodePath } from './owners.js'
import { jsonInit, requestJson } from './request.js'
import type { IndexEntry, StoreInfo } from './sections.js'
import { cardOf, pageFrom, slugOf, storeOrder, type TemplateCard, type TemplateSource } from './templates.js'

export interface NewFromTemplateProps {
  /** The open folder: where the page is written. */
  readonly folder: string
  readonly sources: readonly TemplateSource[]
  readonly pages: readonly IndexEntry[]
  readonly stores: readonly StoreInfo[]
  readonly fetchImpl: typeof fetch
  readonly locale: Locale
  readonly openPage: (path: string, store?: string) => void
  readonly t: (key: string) => string
}

type Seed =
  | { readonly state: 'loading'; readonly source: TemplateSource }
  | { readonly state: 'ready'; readonly source: TemplateSource; readonly card: TemplateCard }
  | { readonly state: 'failed'; readonly source: TemplateSource }

type Verdict = 'idle' | 'writing' | 'taken' | 'refused'

/** The sheet's own words under the field, keyed so the translator finds them. */
const NO_SLUG = 'Give the page a title with at least one letter or digit.'

export function NewFromTemplate(props: NewFromTemplateProps) {
  const { sources, t } = props
  const [open, setOpen] = useState(false)
  if (sources.length === 0) return null
  return (
    <>
      {/* Closing the sheet hands focus back to this button: the sheet's own trap remembers it. */}
      <Button icon="plus" className="adestia-chead__action" onClick={() => setOpen(true)}>
        {t('New from template')}
      </Button>
      {open && <TemplateSheet {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function TemplateSheet({ folder, sources, pages, stores, fetchImpl, locale, openPage, t, onClose }: NewFromTemplateProps & { readonly onClose: () => void }) {
  const [seeds, setSeeds] = useState<readonly Seed[]>(() => sources.map((source) => ({ state: 'loading', source })))
  const [chosen, setChosen] = useState(0)
  const [title, setTitle] = useState('')
  const [verdict, setVerdict] = useState<Verdict>('idle')
  const input = useRef<HTMLInputElement>(null)
  const radios = useRef<(HTMLElement | null)[]>([])
  const alive = useRef(true)
  const headingId = useId()

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const read = useCallback(
    async (source: TemplateSource): Promise<Seed> => {
      if (source.text !== undefined) return { state: 'ready', source, card: cardOf(source, source.text, locale) }
      try {
        const response = await fetchImpl(source.url ?? '')
        if (!response.ok) return { state: 'failed', source }
        return { state: 'ready', source, card: cardOf(source, await response.text(), locale) }
      } catch {
        return { state: 'failed', source }
      }
    },
    [fetchImpl, locale],
  )

  const load = useCallback(
    (source: TemplateSource) => {
      setSeeds((all) => all.map((seed) => (seed.source.id === source.id ? { state: 'loading', source } : seed)))
      void read(source).then((next) => {
        if (alive.current) setSeeds((all) => all.map((seed) => (seed.source.id === source.id ? next : seed)))
      })
    },
    [read],
  )

  useEffect(() => {
    for (const source of sources) load(source)
    // Read once per opening: the sources are the shell's, fixed while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const slug = slugOf(title)
  const selected = seeds[chosen]
  const ready = selected?.state === 'ready' ? selected.card : undefined
  const busy = verdict === 'writing'
  const noSlug = slug === ''
  const taken = verdict === 'taken'

  const create = async () => {
    if (busy || noSlug || !ready) return
    const path = `${folder}/${slug}.md`
    if (pages.some((entry) => entry.path === path)) {
      setVerdict('taken')
      input.current?.focus()
      return
    }
    setVerdict('writing')
    const markdown = pageFrom(ready.text, title)
    const order = storeOrder(folder, pages, stores)
    let attempts: readonly (string | undefined)[] = order.length > 0 ? order : [undefined]
    const tried = new Set<string | undefined>()
    while (attempts.length > 0) {
      const [store, ...rest] = attempts
      attempts = rest
      tried.add(store)
      const answer = await requestJson<unknown>(
        fetchImpl,
        `/api/pages/${encodePath(path)}${store ? `?store=${encodeURIComponent(store)}` : ''}`,
        jsonInit('PUT', { markdown }),
      )
      if (!alive.current) return
      if (answer.ok) {
        onClose()
        openPage(path, store)
        return
      }
      const body = answer.ok ? undefined : (answer.data as { candidates?: { store: string }[]; revision?: string } | undefined)
      if (answer.status === 409 && Array.isArray(body?.candidates) && store === undefined) {
        // Several stores carry the folder and the page told none apart: take the first it names.
        const next = body.candidates.map((one) => one.store).filter((id) => !tried.has(id))
        if (next.length > 0) {
          attempts = next
          continue
        }
      }
      if (answer.status === 409) {
        setVerdict('taken')
        input.current?.focus()
        return
      }
      // A store that refuses the write (403) or fails it (5xx) leaves the next holder to try.
      if ((answer.status === 403 || answer.status >= 500) && attempts.length > 0) continue
      break
    }
    setVerdict('refused')
  }

  const onRadioKey = (event: KeyboardEvent, index: number) => {
    const count = seeds.length
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + count) % count
    else return
    event.preventDefault()
    setChosen(next)
    radios.current[next]?.focus()
  }

  const name = (slugText: string) =>
    t('A page named "%slug" already exists here. Choose another title.').replace('%slug', slugText)

  // Said under the field, never in a toast: taken, or a title with nothing to make a name of.
  const fieldError = taken ? name(slug) : noSlug && title.trim() !== '' ? t(NO_SLUG) : undefined

  return (
    <Sheet open title={t('New from template')} onClose={onClose} className="adestia-templatesheet" t={t}>
      <form
        className="adestia-templates"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <div role="radiogroup" aria-labelledby={headingId} className="adestia-templates__cards">
          <span id={headingId} className="adestia-templates__heading">{t('Template')}</span>
          {seeds.map((seed, index) =>
            seed.state === 'ready' ? (
              <ImageCard
                key={seed.source.id}
                card={seed.card}
                checked={chosen === index}
                refFor={(el) => { radios.current[index] = el }}
                onChoose={() => setChosen(index)}
                onKeyDown={(event) => onRadioKey(event, index)}
              />
            ) : seed.state === 'loading' ? (
              <Loading key={seed.source.id} t={t} />
            ) : (
              <Failure
                key={seed.source.id}
                message={t('The template "%name" could not be read.').replace('%name', seed.source.id)}
                onRetry={() => load(seed.source)}
                t={t}
              />
            ),
          )}
        </div>
        <Field
          label={t('Title')}
          {...(fieldError ? { error: fieldError } : noSlug ? { help: t(NO_SLUG) } : {})}
        >
          <input
            ref={input}
            className="adestia-input"
            value={title}
            autoFocus
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value)
              if (verdict === 'taken' || verdict === 'refused') setVerdict('idle')
            }}
          />
        </Field>
        {verdict === 'refused' ? (
          <p className="adestia-templates__error" role="alert">
            {t('The page could not be written. Try again.')}
          </p>
        ) : null}
        <div className="adestia-templates__foot">
          <Button type="button" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="accent" icon="check" busy={busy} disabled={busy || noSlug || !ready}>
            {t('Create')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/** `.adestia-imagecard` (docs/charte.md § 4): a picture above a name and a line, one of a radiogroup. */
function ImageCard({
  card,
  checked,
  refFor,
  onChoose,
  onKeyDown,
}: {
  readonly card: TemplateCard
  readonly checked: boolean
  readonly refFor: (el: HTMLElement | null) => void
  readonly onChoose: () => void
  readonly onKeyDown: (event: KeyboardEvent) => void
}) {
  return (
    <div
      ref={refFor}
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      className="adestia-imagecard"
      onClick={onChoose}
      onKeyDown={onKeyDown}
    >
      {card.image ? <img className="adestia-imagecard__image" src={card.image} alt="" /> : <span className="adestia-imagecard__image adestia-imagecard__image--none" aria-hidden="true" />}
      <span className="adestia-imagecard__name">{card.name}</span>
      {card.line ? <span className="adestia-imagecard__line">{card.line}</span> : null}
    </div>
  )
}
