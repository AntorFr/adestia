/** The conversation list: every conversation, with the dot the tab strip uses. */

import type { ConversationMeta } from './conversations.js'
import type { TabDot } from './tabs.js'

export interface ConversationListProps {
  readonly conversations: readonly ConversationMeta[]
  readonly activeId: string
  readonly dotOf: (id: string, meta?: ConversationMeta) => TabDot
  readonly openConversation: (id: string) => void
  readonly archive: (id: string) => Promise<void>
  readonly t: (key: string) => string
}

export function ConversationList({
  conversations,
  activeId,
  dotOf,
  openConversation,
  archive,
  t,
}: ConversationListProps) {
  return (
      <ul className="adestia-conversations">
        {conversations.length === 0 && <li className="adestia-conversations__empty">No conversation yet.</li>}
        {conversations.map((meta) => (
          <li key={meta.id}>
            <button
              type="button"
              className={`adestia-conversations__item${
                meta.id === activeId ? ' adestia-conversations__item--current' : ''
              }`}
              onClick={() => openConversation(meta.id)}
            >
              {/* The same dot vocabulary as the tab strip: on a phone this
                  list IS the tab strip. */}
              <span className={`adestia-dot adestia-dot--${dotOf(meta.id, meta)}`} aria-hidden="true" />
              {meta.title}
            </button>
            {/* Put away, not deleted: the only tool for tidying up was a
                delete that took every word with it. */}
            <button
              type="button"
              className="adestia-conversations__archive"
              aria-label={`${t('Archive')} — ${meta.title}`}
              title={t('Archive')}
              onClick={() => void archive(meta.id)}
            >
              <ArchiveGlyph />
            </button>
          </li>
        ))}
      </ul>
  )
}

/** A box with a lid, not a backspace: "put away", the one thing this does. */
export function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}
