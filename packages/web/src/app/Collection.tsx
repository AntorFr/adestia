/**
 * A page typed `collection`, drawn by the core.
 *
 * The page's own words first — a declaration is content, and a layout
 * composes with the document rather than hiding it — then its members: the
 * facets as cards when it groups by something, the pages as cards otherwise,
 * and what is finished folded away at the bottom, never dropped.
 *
 * It wears the section screen's clothes on purpose. A collection and a
 * section answer the same question — what is here, and what is still alive
 * in it — and the design found the two had drifted into two implementations
 * of one idea. Same cards, same fold, same words.
 *
 * `into:` is the one thing a collection says that a folder cannot: where a
 * NEW member lands. The button asks the agent rather than opening a form,
 * because a member is a page, and writing pages is the agent's job.
 */

import { createContext, useContext, useState } from 'react'

import { toneOf } from '@antorfr/adestia-content'

import type { LayoutProps } from '../plugins/contract.js'
import { collectionOf, facetsOf, statusOf, type Facet, type Member } from './collections.js'
import type { IndexEntry } from './sections.js'

/**
 * What the shell lends the layout: the live index, the composer's ask, and
 * the translator. A context rather than props, because the editor hands a
 * layout only what the plugin contract promises — and the core's own layout
 * must not need a second contract to read the shell it lives in.
 */
export interface CollectionShellValue {
  readonly entries: readonly IndexEntry[]
  readonly ask?: ((prompt: string) => void) | undefined
  readonly t: (key: string) => string
}

export const CollectionShell = createContext<CollectionShellValue>({
  entries: [],
  t: (key) => key,
})

function MemberCard({ member, onOpen }: { readonly member: Member; readonly onOpen: () => void }) {
  const status = statusOf(member.fields)
  return (
    <li>
      <button type="button" className="adestia-card" onClick={onOpen}>
        <span className="adestia-card__title">{member.title}</span>
        {status && (
          <span className="adestia-card__foot">
            <span className={`adestia-stat adestia-stat--${toneOf(status)}`}>{status}</span>
          </span>
        )}
      </button>
    </li>
  )
}

export function CollectionLayout({ fields, openPage, children }: LayoutProps) {
  const { entries, ask, t } = useContext(CollectionShell)
  const [facet, setFacet] = useState<string | undefined>(undefined)

  const collection = collectionOf(fields, entries)
  const facets = facetsOf(collection, t)
  const open: Facet | undefined = facet === undefined ? undefined : facets?.find((f) => f.value === facet)

  const pages = (count: number) => `${count} ${count === 1 ? t('page') : t('pages')}`
  const archived = (count: number) => (count === 1 ? t('1 archived') : t('%n archived').replace('%n', String(count)))
  /** "4 pages · 1 archived" — two figures, because "5 pages" over a grid
      showing four is the arithmetic that teaches people to distrust a count. */
  const counts = (live: number, done: number) =>
    [live > 0 ? pages(live) : t('nothing live'), done > 0 ? archived(done) : '']
      .filter(Boolean)
      .join(' · ')

  const rows = (members: readonly Member[]) => (
    <ul className="adestia-cards">
      {members.map((member) => (
        <MemberCard key={member.path} member={member} onOpen={() => openPage?.(member.path)} />
      ))}
    </ul>
  )

  // Closed, always — the same posture as a section's own archive. The count
  // on the summary already says the pages are there.
  const fold = (members: readonly Member[]) =>
    members.length > 0 && (
      <details className="adestia-archive">
        <summary>
          {t('Finished')} <span className="adestia-archive__count">{members.length}</span>
        </summary>
        {rows(members)}
      </details>
    )

  return (
    <div className="adestia-collection">
      {children}

      {!collection.of && (
        <p className="adestia-collection__problem">
          {t('This collection declares no `of:` and collects nothing.')}
        </p>
      )}

      {open ? (
        <>
          <div className="adestia-collection__nav">
            <button type="button" className="adestia-pill" onClick={() => setFacet(undefined)}>
              ‹ {t('All')}
            </button>
            <h2 className="adestia-section">{open.label}</h2>
            <span className="adestia-collection__count">{counts(open.live.length, open.archived.length)}</span>
          </div>
          {open.live.length > 0
            ? rows(open.live)
            : open.archived.length > 0 && (
                <p className="adestia-empty">{t('Everything here is finished.')}</p>
              )}
          {fold(open.archived)}
        </>
      ) : (
        <>
          {collection.of && (
            <p className="adestia-collection__count">
              {counts(collection.live.length, collection.archived.length)}
            </p>
          )}
          {facets ? (
            <ul className="adestia-cards">
              {facets.map((f) => (
                <li key={f.value}>
                  <button type="button" className="adestia-card" onClick={() => setFacet(f.value)}>
                    <span className="adestia-card__title">{f.label}</span>
                    <span className="adestia-card__foot">
                      <span className="adestia-chip">{f.live.length > 0 ? pages(f.live.length) : t('nothing live')}</span>
                      {f.archived.length > 0 && <span className="adestia-chip">{archived(f.archived.length)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {collection.live.length > 0 && rows(collection.live)}
              {fold(collection.archived)}
            </>
          )}
        </>
      )}

      {collection.of && collection.into && ask && (
        <button
          type="button"
          className="adestia-pill adestia-collection__new"
          onClick={() =>
            ask(
              t('Create a new page of type “%type” in %into, for this collection.')
                .replace('%type', collection.of ?? '')
                .replace('%into', collection.into ?? ''),
            )
          }
        >
          ＋ {t('Ask for a new page')}
        </button>
      )}
    </div>
  )
}
