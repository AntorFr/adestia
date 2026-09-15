/**
 * One message in the thread, and the answer while it is still arriving.
 */

import { useState } from 'react'

// Markdown in a bubble is the SAME renderer a page is read through — one
// grammar, one switch, no second vocabulary and no new dependency.
import { Prose } from '../editor/Reader.js'
import type { TurnPart, TurnState } from './stream.js'
import { PROSE_CADENCE_MS, useCadence } from './useCadence.js'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly text: string
  readonly tools?: readonly { name: string; target?: string | undefined; ok?: boolean | undefined }[]
  readonly stopped?: boolean
  readonly error?: string | undefined
}

export function ToolTrace({ tools }: { tools: Message['tools'] }) {
  const [open, setOpen] = useState(false)
  if (!tools || tools.length === 0) return null

  return (
    <div className="adestia-trace">
      <button type="button" className="adestia-trace__toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {tools.length} tool call{tools.length > 1 ? 's' : ''}
      </button>
      {open && (
        <ul className="adestia-trace__list">
          {tools.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className={`adestia-trace__item adestia-trace__item--${
              tool.ok === false ? 'failed' : tool.ok ? 'done' : 'running'
            }`}>
              <span className="adestia-trace__glyph">◇</span>
              <span className="adestia-trace__name">{tool.name}</span>
              {/* The target only. Never the full input: it routinely holds a
                  file's contents or an entire command. */}
              {tool.target && <span className="adestia-trace__target">{tool.target}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One message in the thread.
 *
 * The agent's half is rendered as MARKDOWN, because markdown is what it
 * writes: an answer that says `**important**` and `[la fiche](voyages/x.md)`
 * was showing its asterisks and its brackets, which is the transcript of a
 * formatting intention rather than the formatting itself.
 *
 * The user's half deliberately is not. What somebody typed is what they meant
 * — a message about `**` must be able to contain `**`, and a person typing
 * into a text field has no way to escape a grammar nobody told them applied.
 * The predecessor drew the same line, and it is the right one.
 */
export function Bubble({
  message,
  openPage,
  t = (key) => key,
}: {
  message: Message
  /** Lets a workspace path the agent named open the page. Absent, it is text. */
  openPage?: (path: string) => void
  t?: (key: string) => string
}) {
  return (
    <article className={`adestia-bubble adestia-bubble--${message.role}`}>
      {message.role === 'agent' && <ToolTrace tools={message.tools} />}
      {message.text &&
        (message.role === 'agent' ? (
          <Prose markdown={message.text} {...(openPage ? { openPage } : {})} />
        ) : (
          <div className="adestia-bubble__text">{message.text}</div>
        ))}
      {/* Said in the reader's language, like everything else they are told:
          the dictionary has carried "Tour interrompu." all along, and the one
          sentence that says what became of their turn reached them in English. */}
      {message.stopped && <p className="adestia-bubble__note">{t('Turn interrupted.')}</p>}
      {message.error && <p className="adestia-bubble__error">{message.error}</p>}
    </article>
  )
}

/**
 * The parts to DRAW for a live turn.
 *
 * A turn that has not produced anything yet has no parts at all, and the
 * indicator has to hang somewhere: one empty part is that somewhere. It keeps
 * "nothing has happened yet" and "the agent is between two answers" as the
 * same shape, so the bubble is written once.
 */
export function livePartsOf(state: TurnState): readonly TurnPart[] {
  return state.parts.length > 0 ? state.parts : [{ tools: [], text: '' }]
}

/**
 * The answer while it is still arriving.
 *
 * Its own component for one reason: the cadence is a hook, and the live bubble
 * exists only some of the time. See useCadence.ts for why a growing answer is
 * not re-parsed on every delta.
 */
export function LiveProse({
  text,
  openPage,
}: {
  text: string
  openPage?: (path: string) => void
}) {
  const shown = useCadence(text, PROSE_CADENCE_MS)
  return <Prose markdown={shown} {...(openPage ? { openPage } : {})} />
}
