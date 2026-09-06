/**
 * The delegations screen — what other agents asked this one to do.
 *
 * A window, not a desk. These threads belong to the CALLING agents'
 * conversations: a person typing into one would inject a turn into a thread
 * its owner believes it holds alone, so there is no composer here and never
 * will be. What a person gets is the half that was missing entirely — seeing
 * what alfred was asked, what it answered, and whether something is running
 * right now.
 *
 * It sits beside "MCP servers" in the settings mosaic on purpose: that page
 * is the agents this instance REACHES, this one is the agents that reach IT —
 * two faces of the same wiring, side by side.
 *
 * Grouped by caller because the store is: the channel namespaces threads per
 * calling agent (that separation is the server's authorization boundary, not
 * a display choice — this screen merely shows the seam that already exists).
 */

import { useEffect, useState } from 'react'

import { Bubble, type Message } from '../chat/Chat.js'
import type { StoredMessage } from '../chat/conversations.js'

export interface DelegationRow {
  readonly caller: string
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  /** Present only while the thread's turn runs — computed, never stored. */
  readonly turn?: 'running' | 'waiting'
}

export interface DelegationThread {
  readonly caller: string
  readonly id: string
  readonly title: string
  readonly messages: readonly StoredMessage[]
}

/** The same conversion the chat applies to its own stored messages. */
function toMessage(stored: StoredMessage): Message {
  return {
    id: stored.id,
    role: stored.role,
    text: stored.text,
    ...(stored.tools ? { tools: stored.tools } : {}),
    ...(stored.stopped ? { stopped: stored.stopped } : {}),
    ...(stored.error ? { error: stored.error } : {}),
  }
}

/** Rows bundled per caller, callers alphabetical, rows kept newest-first. */
export function groupByCaller(
  rows: readonly DelegationRow[],
): readonly { caller: string; rows: readonly DelegationRow[] }[] {
  const groups = new Map<string, DelegationRow[]>()
  for (const row of rows) {
    const bucket = groups.get(row.caller)
    if (bucket) bucket.push(row)
    else groups.set(row.caller, [row])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([caller, grouped]) => ({ caller, rows: grouped }))
}

/**
 * The tile's chips, counted rather than described — the neighbours count in
 * chips ("4 files", "2 servers") and a lone subtitle number among them read
 * as a different species on the same shelf. The running count earns its chip
 * only when something actually runs: one that always said "0 running" is a
 * chip nobody reads.
 */
export function delegChips(
  rows: readonly DelegationRow[],
  t: (key: string) => string,
): { text: string }[] {
  const running = rows.filter((row) => row.turn !== undefined).length
  return [
    { text: `${rows.length} ${rows.length === 1 ? t('thread') : t('threads')}` },
    ...(running > 0 ? [{ text: t('%n running').replace('%n', String(running)) }] : []),
  ]
}

/** The rows, for the tile that counts them. `enabled` keeps the mosaic from
    fetching what an open page already shows. */
export function useDelegationRows(
  fetchImpl: typeof fetch,
  enabled: boolean,
): readonly DelegationRow[] | undefined {
  const [rows, setRows] = useState<readonly DelegationRow[] | undefined>()
  useEffect(() => {
    if (!enabled) return
    let live = true
    void (async () => {
      try {
        const response = await fetchImpl('/api/delegations')
        if (!response.ok) return
        const body = (await response.json()) as { delegations?: readonly DelegationRow[] }
        if (live) setRows(body.delegations ?? [])
      } catch {
        /* no figure, no chip */
      }
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, enabled])
  return rows
}

/** When a thread last moved, in the reader's locale — date only once it is
    old news: the hour matters on the day itself and is noise a week later. */
export function lastMoved(updatedAt: string, locale?: string, now = new Date()): string {
  const at = new Date(updatedAt)
  if (Number.isNaN(at.getTime())) return ''
  return at.toDateString() === now.toDateString()
    ? at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString(locale)
}

export interface DelegationsProps {
  /** The open thread, from the address: `<caller>/<id>`. */
  readonly open?: string | undefined
  readonly onOpen: (item: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
  readonly locale?: string | undefined
}

export function Delegations({
  open,
  onOpen,
  fetchImpl = fetch,
  t = (key) => key,
  locale,
}: DelegationsProps) {
  const [rows, setRows] = useState<readonly DelegationRow[] | undefined>()
  const [thread, setThread] = useState<DelegationThread | undefined>()

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const response = await fetchImpl('/api/delegations')
        if (!response.ok) return
        const body = (await response.json()) as { delegations?: readonly DelegationRow[] }
        if (live) setRows(body.delegations ?? [])
      } catch {
        /* the empty state says there is nothing to show, which is then true */
      }
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, open])

  useEffect(() => {
    if (!open) {
      setThread(undefined)
      return
    }
    let live = true
    void (async () => {
      try {
        const response = await fetchImpl(
          `/api/delegations/${open.split('/').map(encodeURIComponent).join('/')}`,
        )
        if (!response.ok) return
        if (live) setThread((await response.json()) as DelegationThread)
      } catch {
        /* stays on the list; the address still names the thread */
      }
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, open])

  if (open && thread) {
    return (
      <div className="adestia-deleg">
        <header className="adestia-chead">
          <span className="adestia-chead__icon" aria-hidden="true">
            🤝
          </span>
          <div>
            <h1 className="adestia-chead__title">{thread.title}</h1>
            {/* Why there is no composer under this thread, said where the
                composer would be looked for. */}
            <p className="adestia-chead__lede">
              {t('Read-only — this conversation belongs to')} {thread.caller}
            </p>
          </div>
        </header>
        <div className="adestia-chat__thread adestia-deleg__thread">
          {thread.messages.map((message) => (
            <Bubble key={message.id} message={toMessage(message)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="adestia-deleg">
      <header className="adestia-chead">
        <span className="adestia-chead__icon" aria-hidden="true">
          🤝
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Delegations')}</h1>
          <p className="adestia-chead__lede">{t('What other agents asked this one to do')}</p>
        </div>
      </header>

      {rows !== undefined && rows.length === 0 && (
        <p className="adestia-deleg__empty">
          {t('No delegated task yet — the threads other agents open here will appear by caller.')}
        </p>
      )}

      {groupByCaller(rows ?? []).map((group) => (
        <section key={group.caller} className="adestia-deleg__group">
          <h2 className="adestia-deleg__caller">{group.caller}</h2>
          <ul className="adestia-threads">
            {group.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="adestia-threads__item"
                  onClick={() => onOpen(`${group.caller}/${row.id}`)}
                >
                  {/* The chat's dot vocabulary: this list answers the same
                      question — is something happening behind this row. */}
                  {row.turn && (
                    <span
                      className={`adestia-dot adestia-dot--${row.turn === 'waiting' ? 'waiting' : 'working'}`}
                      aria-hidden="true"
                    />
                  )}
                  {row.title}
                  <span className="adestia-deleg__when">{lastMoved(row.updatedAt, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
