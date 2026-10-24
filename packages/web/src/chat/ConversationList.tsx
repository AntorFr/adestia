/** The conversation list: every conversation, with the dot the tab strip uses. */

import { Icon } from '../app/Icon.js'
import { EmptyState } from '../app/ui/EmptyState.js'

import { StatusDot } from './StatusDot.js'

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
        {conversations.length === 0 && <li className="adestia-conversations__empty"><EmptyState icon="list" text={t('No conversation yet.')} /></li>}
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
              <StatusDot state={dotOf(meta.id, meta)} t={t} />
              {meta.title}
            </button>
            {/* Put away, not deleted: the only tool for tidying up was a
                delete that took every word with it. */}
            <button
              type="button"
              className="adestia-conversations__archive adestia-btn adestia-btn--ghost adestia-btn--icon"
              aria-label={`${t('Archive')} — ${meta.title}`}
              title={t('Archive')}
              onClick={() => void archive(meta.id)}
            >
              <Icon name="archive" />
            </button>
          </li>
        ))}
      </ul>
  )
}
