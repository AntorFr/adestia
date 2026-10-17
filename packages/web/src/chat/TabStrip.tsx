/** The tab strip — a desktop surface; on a phone the conversation list is the navigation. */

import { useRef } from 'react'

import { StatusDot } from './StatusDot.js'

import type { ConversationMeta } from './conversations.js'
import { Icon } from '../app/Icon.js'
import { DRAFT, type OpenConversation } from './useConversations.js'
import type { TabDot, TabsState } from './tabs.js'

export interface TabStripProps {
  readonly tabs: TabsState
  readonly activeId: string
  readonly conversations: readonly ConversationMeta[]
  readonly conversation: (id: string) => OpenConversation
  readonly dotOf: (id: string, meta?: ConversationMeta) => TabDot
  readonly activate: (id: string) => void
  readonly archive: (id: string) => Promise<void>
  readonly shut: (id: string) => void
  readonly moveTab: (from: number, to: number) => void
  readonly t: (key: string) => string
}

export function TabStrip({
  tabs,
  activeId,
  conversations,
  conversation,
  dotOf,
  activate,
  archive,
  shut,
  moveTab,
  t,
}: TabStripProps) {
  /** Drag origin while a tab is being reordered. */
  const dragFrom = useRef<number | undefined>(undefined)
  return (
      <div className="adestia-tabs" role="tablist">
        {tabs.open.map((id, index) => {
          const title =
            id === DRAFT
              ? t('New conversation')
              : conversation(id).title ?? conversations.find((meta) => meta.id === id)?.title ?? '…'
          return (
            <div
              key={id}
              className={`adestia-tab${id === activeId ? ' adestia-tab--active' : ''}`}
              role="tab"
              aria-selected={id === activeId}
              draggable
              onDragStart={() => {
                dragFrom.current = index
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const from = dragFrom.current
                dragFrom.current = undefined
                if (from !== undefined) moveTab(from, index)
              }}
            >
              <button
                type="button"
                className="adestia-tab__pick"
                onClick={() => activate(id)}
                title={title}
              >
                <StatusDot state={dotOf(id)} t={t} />
                <span className="adestia-tab__title">{title}</span>
              </button>
              {/* Two exits, two meanings: the box puts the CONVERSATION
                  away, the cross only closes the TAB — the conversation stays in
                  the list, dot and all. */}
              {id !== DRAFT && (
                <button
                  type="button"
                  className="adestia-tab__tool adestia-btn adestia-btn--ghost adestia-btn--icon"
                  aria-label={`${t('Archive')} — ${title}`}
                  title={t('Archive')}
                  onClick={() => void archive(id)}
                >
                  <Icon name="archive" />
                </button>
              )}
              <button
                type="button"
                className="adestia-tab__tool adestia-btn adestia-btn--ghost adestia-btn--icon"
                aria-label={`${t('Close tab')} — ${title}`}
                title={t('Close tab')}
                onClick={() => shut(id)}
              >
                <Icon name="x" />
              </button>
            </div>
          )
        })}
      </div>
  )
}
