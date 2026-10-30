/** The conversation list: every conversation, with the dot the tab strip uses. */

import { Icon } from '../app/Icon.js'
import { EmptyState, Failure, Loading } from '../app/ui/index.js'

import { StatusDot } from './StatusDot.js'

import type { ConversationMeta } from './conversations.js'
import type { TabDot } from './tabs.js'
import type { ListState } from './useConversations.js'

export interface ConversationListProps {
  readonly conversations: readonly ConversationMeta[]
  readonly state: ListState
  readonly retry: () => void
  readonly activeId: string
  readonly dotOf: (id: string, meta?: ConversationMeta) => TabDot
  readonly openConversation: (id: string) => void
  readonly archive: (id: string) => Promise<void>
  readonly t: (key: string) => string
}

export function ConversationList({
  conversations,
  state,
  retry,
  activeId,
  dotOf,
  openConversation,
  archive,
  t,
}: ConversationListProps) {
  // Rows (and the empty state) only exist once the list answered: loading and
  // empty never show together, and a Retry never leaves old rows beside Loading.
  if (state.status === 'loading') return <div className="adestia-conversations"><Loading t={t} /></div>
  if (state.status === 'failed') {
    return <div className="adestia-conversations"><Failure message={state.error} onRetry={retry} t={t} /></div>
  }
  if (state.status === 'denied') return null
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
