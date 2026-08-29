/**
 * One section, opened.
 *
 * What it replaced: a bare heading over a flat list of links — the landing
 * canvas's old failing, one level down. A section screen has the same job as
 * the home: say where you are, then let you scan rather than read.
 *
 * So it wears the same clothes: a header carrying the section's own livery,
 * mosaics of cards rather than rows, and a meta line under each title that
 * says something TRUE about the page — its status if it declares one, its
 * category, its role. Pages that declare nothing get a card with a title,
 * which is honest; inventing a subtitle would be worse than the flat list.
 *
 * Rooms come before pages, and finished things fold away at the bottom: what
 * leads somewhere else, then what is live, then what is done.
 */

import { useMemo, useState } from 'react'

import { isFinished, toneOf } from '@antorfr/demeura-content'

import type { IndexEntry, SectionTile } from './sections.js'
import { pagesIn, subsectionsOf } from './sections.js'

export interface SectionProps {
  readonly path: string
  readonly title: string
  /** The section's own icon and hue, from its index page. */
  readonly tile?: SectionTile
  readonly entries: readonly IndexEntry[]
  readonly openSection: (path: string) => void
  readonly openPage: (path: string) => void
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function statusOf(entry: IndexEntry): string | undefined {
  return text(entry.fields['status']) ?? text(entry.fields['statut'])
}

function tagsOf(entry: IndexEntry): readonly string[] {
  const raw = entry.fields['tags']
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

/**
 * The facet a section is filtered by.
 *
 * Whichever of status / role / cat its pages actually declare, in that order:
 * a section of contacts filters by role, one of projects by status. Chosen
 * from the CONTENT rather than configured, so a new kind of section needs no
 * entry anywhere.
 */
function facetKeyOf(pages: readonly IndexEntry[]): string | undefined {
  for (const key of ['status', 'role', 'cat']) {
    if (pages.some((entry) => text(entry.fields[key]))) return key
  }
  return undefined
}

function hueVar(hue: string | undefined): Record<string, string> {
  return hue ? { '--tile-color': `var(--demeura-hue-${hue}, var(--accent))` } : {}
}

/**
 * A page, as a card.
 *
 * The foot is where a page says what it is without being opened: its status
 * as a coloured pill (the dot carries the colour, so the meaning survives for
 * anyone who cannot rely on hue alone — the word is always written out), its
 * role, and up to three tags. Three, because a card with nine chips is a card
 * nobody scans; the rest are still on the page itself.
 */
function PageCard({
  entry,
  onOpen,
}: {
  readonly entry: IndexEntry
  readonly onOpen: () => void
}) {
  const status = statusOf(entry)
  const role = text(entry.fields['role'])
  const tags = tagsOf(entry).slice(0, 3)
  const hasFoot = status !== undefined || role !== undefined || tags.length > 0

  return (
    <li>
      <button type="button" className="demeura-card" onClick={onOpen}>
        <span className="demeura-card__title">{entry.title}</span>
        {hasFoot && (
          <span className="demeura-card__foot">
            {status && (
              <span className={`demeura-stat demeura-stat--${toneOf(status)}`}>{status}</span>
            )}
            {role && <span className="demeura-tag">{role}</span>}
            {tags.map((tag) => (
              <span key={tag} className="demeura-tag">
                #{tag}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  )
}

function RoomCard({
  room,
  onOpen,
  t,
}: {
  readonly room: SectionTile
  readonly onOpen: () => void
  readonly t: (key: string) => string
}) {
  return (
    <li>
      <button type="button" className="demeura-tile" style={hueVar(room.hue)} onClick={onOpen}>
        <span className="demeura-tile__icon" aria-hidden="true">
          {room.icon}
        </span>
        <span className="demeura-tile__label">{room.title}</span>
        <span className="demeura-tile__foot">
          <span className="demeura-chip">
            {room.count} {room.count === 1 ? t('page') : t('pages')}
          </span>
        </span>
      </button>
    </li>
  )
}

export function Section({
  path,
  title,
  tile,
  entries,
  openSection,
  openPage,
  t = (key) => key,
}: SectionProps) {
  const rooms = subsectionsOf(entries, path)
  const all = pagesIn(entries, path)
  const live = all.filter((entry) => !isFinished(entry.fields))
  const finished = all.filter((entry) => isFinished(entry.fields))

  const [query, setQuery] = useState('')
  const [facet, setFacet] = useState<string | undefined>(undefined)

  const facetKey = facetKeyOf(live)
  const facetValues = useMemo(() => {
    if (!facetKey) return []
    return [...new Set(live.map((entry) => text(entry.fields[facetKey])).filter(Boolean))].sort() as string[]
  }, [live, facetKey])

  /**
   * Search covers what a card SHOWS — title, status, role, tags — plus the
   * path. Searching hidden fields would make results appear for a reason
   * nobody can see on screen.
   */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return live.filter((entry) => {
      if (facet && facetKey && text(entry.fields[facetKey]) !== facet) return false
      if (needle === '') return true
      const haystack = [entry.title, entry.path, statusOf(entry), text(entry.fields['role']), ...tagsOf(entry)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [live, query, facet, facetKey])

  const lede = rooms.length > 0 ? t('Rooms lead to pages.') : t('Cards open a page.')

  return (
    <div className="demeura-home" style={hueVar(tile?.hue)}>
      {/* No back button: the breadcrumb in the top bar already says
          "Home / Maison" and its first crumb is the way back. Two controls
          for one move is one too many. */}
      {/* The section's own livery, worn where you land — the same plate the
          tile you came from was wearing, so the move reads as a descent
          rather than a jump to somewhere unrelated. */}
      <header className="demeura-chead">
        <span className="demeura-chead__icon" aria-hidden="true">
          {tile?.icon ?? '◆'}
        </span>
        <div>
          <h1 className="demeura-chead__title">{title}</h1>
          <p className="demeura-chead__lede">{lede}</p>
        </div>
      </header>

      {rooms.length > 0 && (
        <>
          <h2 className="demeura-section">{t('Inside')}</h2>
          <ul className="demeura-tiles">
            {rooms.map((room) => (
              <RoomCard key={room.path} room={room} t={t} onOpen={() => openSection(room.path)} />
            ))}
          </ul>
        </>
      )}

      {live.length > 0 && (
        <>
          <h2 className="demeura-section">{t('Pages')}</h2>

          {/* The toolbar appears only where it earns its place: a handful of
              cards is faster to read than to filter, and facet pills for a
              single value would be a control with one setting. */}
          {(live.length > 5 || facetValues.length > 1) && (
            <div className="demeura-toolbar">
              <label className="demeura-search">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('Search…')}
                  aria-label={t('Search this section')}
                />
              </label>
              {facetValues.length > 1 && (
                <div className="demeura-facets">
                  <button
                    type="button"
                    className={facet === undefined ? 'demeura-pill demeura-pill--on' : 'demeura-pill'}
                    onClick={() => setFacet(undefined)}
                  >
                    {t('All')}
                  </button>
                  {facetValues.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={facet === value ? 'demeura-pill demeura-pill--on' : 'demeura-pill'}
                      onClick={() => setFacet(facet === value ? undefined : value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {shown.length > 0 ? (
            <ul className="demeura-cards">
              {shown.map((entry) => (
                <PageCard key={entry.path} entry={entry} onOpen={() => openPage(entry.path)} />
              ))}
            </ul>
          ) : (
            <p className="demeura-empty">{t('Nothing matches.')}</p>
          )}
        </>
      )}

      {/* Finished things leave the grid of living ones rather than the
          section: folded away, counted, one click from being read again. */}
      {finished.length > 0 && (
        <details className="demeura-archive">
          <summary>
            {t('Finished')} <span className="demeura-archive__count">{finished.length}</span>
          </summary>
          <ul className="demeura-cards">
            {finished.map((entry) => (
              <PageCard key={entry.path} entry={entry} onOpen={() => openPage(entry.path)} />
            ))}
          </ul>
        </details>
      )}

      {rooms.length === 0 && all.length === 0 && (
        <section className="demeura-empty">
          <p>{t('This section holds nothing yet.')}</p>
        </section>
      )}
    </div>
  )
}
