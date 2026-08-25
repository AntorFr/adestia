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
}

/**
 * Statuses that mean "over".
 *
 * MEASURED against a real corpus, not guessed: the first version of this list
 * was a plausible set of French words that happened to miss `clos`, which is
 * what that corpus actually writes eleven times — so eleven finished projects
 * sat among the live ones and the fold never appeared. A vocabulary somebody
 * else writes is something to go and read.
 *
 * Still a small closed set, and a page whose status we do not recognise stays
 * with the living: that is the safe direction. Hiding something over an
 * unfamiliar word would make the section lie about its own size.
 */
const FINISHED = new Set([
  'clos',
  'réalisé',
  'realise',
  'terminé',
  'termine',
  'fait',
  'done',
  'archivé',
  'archive',
  'archived',
  'abandonné',
  'abandonne',
  'closed',
])

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function statusOf(entry: IndexEntry): string | undefined {
  return text(entry.fields['status']) ?? text(entry.fields['statut'])
}

function isFinished(entry: IndexEntry): boolean {
  const status = statusOf(entry)?.toLowerCase()
  return status ? FINISHED.has(status) : false
}

/**
 * The line under a card's title.
 *
 * Built from what the page actually declares, in the order somebody scanning
 * would want it: what state it is in, then what kind of thing it is. Empty
 * when the page declares nothing — a card with a title alone beats a card
 * with a subtitle we made up.
 */
function metaOf(entry: IndexEntry): string {
  return [statusOf(entry), text(entry.fields['cat']), text(entry.fields['role'])]
    .filter(Boolean)
    .join(' · ')
}

function hueVar(hue: string | undefined): Record<string, string> {
  return hue ? { '--tile-color': `var(--golem-hue-${hue}, var(--accent))` } : {}
}

function PageCard({
  entry,
  onOpen,
}: {
  readonly entry: IndexEntry
  readonly onOpen: () => void
}) {
  const meta = metaOf(entry)
  return (
    <li>
      <button type="button" className="golem-card" onClick={onOpen}>
        <span className="golem-card__title">{entry.title}</span>
        {meta && <span className="golem-card__meta">{meta}</span>}
      </button>
    </li>
  )
}

function RoomCard({
  room,
  onOpen,
}: {
  readonly room: SectionTile
  readonly onOpen: () => void
}) {
  return (
    <li>
      <button type="button" className="golem-tile" style={hueVar(room.hue)} onClick={onOpen}>
        <span className="golem-tile__icon" aria-hidden="true">
          {room.icon}
        </span>
        <span className="golem-tile__label">{room.title}</span>
        <span className="golem-tile__foot">
          <span className="golem-chip">
            {room.count} {room.count === 1 ? 'page' : 'pages'}
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
}: SectionProps) {
  const rooms = subsectionsOf(entries, path)
  const all = pagesIn(entries, path)
  const live = all.filter((entry) => !isFinished(entry))
  const finished = all.filter(isFinished)

  const lede = rooms.length > 0 ? 'Rooms lead to pages.' : 'Cards open a page.'

  return (
    <div className="golem-home" style={hueVar(tile?.hue)}>
      {/* No back button: the breadcrumb in the top bar already says
          "Home / Maison" and its first crumb is the way back. Two controls
          for one move is one too many. */}
      {/* The section's own livery, worn where you land — the same plate the
          tile you came from was wearing, so the move reads as a descent
          rather than a jump to somewhere unrelated. */}
      <header className="golem-chead">
        <span className="golem-chead__icon" aria-hidden="true">
          {tile?.icon ?? '◆'}
        </span>
        <div>
          <h1 className="golem-chead__title">{title}</h1>
          <p className="golem-chead__lede">{lede}</p>
        </div>
      </header>

      {rooms.length > 0 && (
        <>
          <h2 className="golem-section">Inside</h2>
          <ul className="golem-tiles">
            {rooms.map((room) => (
              <RoomCard key={room.path} room={room} onOpen={() => openSection(room.path)} />
            ))}
          </ul>
        </>
      )}

      {live.length > 0 && (
        <>
          <h2 className="golem-section">Pages</h2>
          <ul className="golem-cards">
            {live.map((entry) => (
              <PageCard key={entry.path} entry={entry} onOpen={() => openPage(entry.path)} />
            ))}
          </ul>
        </>
      )}

      {/* Finished things leave the grid of living ones rather than the
          section: folded away, counted, one click from being read again. */}
      {finished.length > 0 && (
        <details className="golem-archive">
          <summary>
            Finished <span className="golem-archive__count">{finished.length}</span>
          </summary>
          <ul className="golem-cards">
            {finished.map((entry) => (
              <PageCard key={entry.path} entry={entry} onOpen={() => openPage(entry.path)} />
            ))}
          </ul>
        </details>
      )}

      {rooms.length === 0 && all.length === 0 && (
        <section className="golem-empty">
          <p>This section holds nothing yet.</p>
        </section>
      )}
    </div>
  )
}
