/** The thread: stored bubbles, the live turn one bubble per part, the held messages. */

import type { RefObject } from 'react'

import { Icon } from '../app/Icon.js'
import { SkinSlot } from '../app/SkinSlot.js'
import type { SkinSlotRender } from '../app/skin.js'
import { Prose } from '../editor/Reader.js'
import { Bubble, LiveProse, ToolTrace, livePartsOf } from './Bubble.js'
import { formatTokens } from './ContextPill.js'
import { SignatureCards, type SigningOptions } from './Signatures.js'
import type { OpenConversation } from './useConversations.js'

export interface ThreadProps {
  readonly active: OpenConversation
  readonly t: (key: string) => string
  readonly openPage?: ((path: string) => void) | undefined
  readonly signing: SigningOptions | undefined
  readonly busySlot?: SkinSlotRender | undefined
  /** The empty block at the bottom the chat scrolls into view. */
  readonly bottom: RefObject<HTMLDivElement | null>
}

export function Thread({ active, t, openPage, signing, busySlot, bottom }: ThreadProps) {
  return (
    <div className="adestia-chat__conversation">
      {active.messages.map((message) => (
        <Bubble
          key={message.id}
          message={message}
          t={t}
          {...(openPage ? { openPage } : {})}
          {...(signing ? { signing } : {})}
        />
      ))}

      {/* A turn draws one bubble PER PART: the agent that answers, works
          again and answers again said two things. Only the last is live —
          the ones behind it are finished, and re-parsing them on every
          delta would re-render the whole turn for each keystroke of it. */}
      {active.live &&
        livePartsOf(active.live).map((part, index, parts) => {
          const last = index === parts.length - 1
          return (
            <article
              key={`l${index}`}
              className={`adestia-bubble adestia-bubble--agent${last ? ' adestia-bubble--live' : ''}`}
            >
              <ToolTrace tools={part.tools} t={t} />
              {part.text &&
                (last ? (
                  <LiveProse text={part.text} {...(openPage ? { openPage } : {})} />
                ) : (
                  <Prose markdown={part.text} {...(openPage ? { openPage } : {})} />
                ))}
              <SignatureCards signatures={part.signatures} signing={signing} t={t} />
              {/* The indicator stays UP for as long as the turn runs, under
                  whatever has been said so far. It used to be the ALTERNATIVE
                  to the text, so the first sentence killed it: the agent then
                  worked for minutes behind a bubble that looked finished. */}
              {last && active.live!.running && (
                <div className="adestia-bubble__working">
                  {busySlot ? (
                    <SkinSlot
                      render={busySlot}
                      className="adestia-busy-host"
                      context={{ ask: () => {}, compose: () => {}, focusComposer: () => {} }}
                    />
                  ) : (
                    <span className="adestia-dots" role="status" aria-label={t('Working')}><Icon name="loader-circle" className="adestia-icon--spin" /></span>
                  )}
                  {/* The climbing counter, when the driver can feed it. */}
                  {active.live!.outputTokens > 0 && (
                    <span className="adestia-bubble__counter">
                      {formatTokens(active.live!.outputTokens)}
                    </span>
                  )}
                </div>
              )}
              {/* A fragment that stands — the stream ended and the conversation
                  could not be read back — says the end it saw, the way a
                  filed message would. */}
              {last && !active.live!.running && active.live!.stopped && (
                <p className="adestia-bubble__note">{t('Turn interrupted.')}</p>
              )}
              {last && !active.live!.running && active.live!.error && (
                <p className="adestia-bubble__error" role="alert"><Icon name="circle-alert" /> {active.live!.error}</p>
              )}
            </article>
          )
        })}

      {/* What was said while the agent was busy, visibly waiting its turn.
          The server holds the real queue; these leave as ONE merged turn
          when the running one settles. */}
      {active.held.map((message, index) => (
        <article key={`h${index}`} className="adestia-bubble adestia-bubble--user adestia-bubble--held">
          <div className="adestia-bubble__text">
            {message.text || <><Icon name="paperclip" /> {message.attachments.map((a) => a.name).join(', ')}</>}
          </div>
        </article>
      ))}
      <div ref={bottom} />
    </div>
  )
}
