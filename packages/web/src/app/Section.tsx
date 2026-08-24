/**
 * One section, opened.
 *
 * Its rooms first, then its own pages — the same order as the landing canvas
 * and for the same reason: what leads somewhere else comes before what ends
 * here.
 */

import type { IndexEntry } from './sections.js'
import { pagesIn, subsectionsOf } from './sections.js'

export interface SectionProps {
  readonly path: string
  readonly title: string
  readonly entries: readonly IndexEntry[]
  readonly openSection: (path: string) => void
  readonly openPage: (path: string) => void
  readonly onBack: () => void
}

export function Section({
  path,
  title,
  entries,
  openSection,
  openPage,
  onBack,
}: SectionProps) {
  const rooms = subsectionsOf(entries, path)
  const pages = pagesIn(entries, path)

  return (
    <div className="golem-home">
      <button type="button" className="golem-switch" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="golem-home__greeting">{title}</h1>

      {rooms.length > 0 && (
        <>
          <h2 className="golem-section">Inside</h2>
          <ul className="golem-tiles">
            {rooms.map((room) => (
              <li key={room.path}>
                <button
                  type="button"
                  className="golem-tile"
                  style={
                    room.hue
                      ? ({ '--tile-color': `var(--golem-hue-${room.hue}, var(--accent))` } as Record<
                          string,
                          string
                        >)
                      : {}
                  }
                  onClick={() => openSection(room.path)}
                >
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
            ))}
          </ul>
        </>
      )}

      {pages.length > 0 && (
        <>
          <h2 className="golem-section">Pages</h2>
          <ul className="golem-pages">
            {pages.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="golem-pages__link"
                  onClick={() => openPage(entry.path)}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {rooms.length === 0 && pages.length === 0 && (
        <section className="golem-empty">
          <p>This section holds nothing yet.</p>
        </section>
      )}
    </div>
  )
}
