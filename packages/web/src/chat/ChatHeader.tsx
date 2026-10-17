/** The chat's header: the body's name, the model, the context, the three buttons. */

import { ContextPill } from './ContextPill.js'
import { ModelPicker, type ModelInfo } from './ModelPicker.js'

export interface ChatHeaderProps {
  readonly brand?: string | undefined
  /** SVG markup for the crest plate, from the skin module (see skin.ts). */
  readonly crest?: string | undefined
  readonly models: readonly ModelInfo[]
  readonly model: string
  readonly onModel: (chosen: string) => void
  readonly tokens: number
  readonly contextWindow?: number | undefined
  readonly listOpen: boolean
  readonly setListOpen: (open: boolean) => void
  readonly refreshConversations: () => Promise<void>
  readonly newDraft: () => void
  readonly onOpenCanvas?: (() => void) | undefined
  readonly t: (key: string) => string
}

export function ChatHeader({
  brand,
  crest,
  models,
  model,
  onModel,
  tokens,
  contextWindow,
  listOpen,
  setListOpen,
  refreshConversations,
  newDraft,
  onOpenCanvas,
  t,
}: ChatHeaderProps) {
  return (
    <header className="adestia-chat__header">
        {/* The crest markup comes from the skin MODULE — code the instance
            already chose to run — never from a manifest. */}
        {crest && (
          <span className="adestia-crest" aria-hidden="true" dangerouslySetInnerHTML={{ __html: crest }} />
        )}
        <span className="adestia-brandname">{brand ?? 'Adestia'}</span>
        {/* Next to the name of the thing about to speak: which engine answers
            belongs to the conversation, not to the message being typed. */}
        <ModelPicker models={models} model={model} onModel={onModel} t={t} />
        <span className="adestia-chat__spacer" />
        <ContextPill
          tokens={tokens}
          {...(contextWindow ? { windowSize: contextWindow } : {})}
        />
        <button
          type="button"
          className="adestia-ib"
          onClick={() => {
            const opening = !listOpen
            setListOpen(opening)
            // Reopened = refreshed: the dots read the desk's live state and
            // the updatedAt the unread marks compare against.
            if (opening) void refreshConversations()
          }}
          aria-label={t('Conversations')}
          aria-expanded={listOpen}
        >
          ▤
        </button>
        <button type="button" className="adestia-ib" onClick={newDraft} aria-label="New conversation">
          ＋
        </button>
        {onOpenCanvas && (
          <button type="button" className="adestia-ib" onClick={onOpenCanvas} aria-label="Open apps">
            ▥
          </button>
        )}
    </header>
  )
}
