/**
 * The delegations screen — what other agents asked this one to do.
 *
 * A window, not a desk. These conversations belong to the CALLING agents: a
 * person typing into one would inject a turn into a conversation
 * its owner believes it holds alone, so there is no composer here and never
 * will be. What a person gets is the half that was missing entirely — seeing
 * what alfred was asked, what it answered, and whether something is running
 * right now.
 *
 * It sits beside "MCP servers" in the settings mosaic on purpose: that page
 * is the agents this instance REACHES, this one is the agents that reach IT —
 * two faces of the same wiring, side by side.
 *
 * Grouped by caller because the store is: the channel namespaces conversations per
 * calling agent (that separation is the server's authorization boundary, not
 * a display choice — this screen merely shows the seam that already exists).
 */

import { Bubble } from '../chat/Bubble.js'
import type { StoredMessage } from '../chat/conversations.js'
import { toMessage } from '../chat/messages.js'
import { Icon } from './Icon.js'
import { useRequest } from './useRequest.js'
import { EmptyState, Loading } from './ui/index.js'
import { ReadFailure } from './ui/ReadFailure.js'

export interface DelegationRow {
  readonly caller: string
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  /** Present only while the conversation's turn runs — computed, never stored. */
  readonly turn?: 'running' | 'waiting'
}

export interface Delegation {
  readonly caller: string
  readonly id: string
  readonly title: string
  readonly messages: readonly StoredMessage[]
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
    { text: `${rows.length} ${rows.length === 1 ? t('conversation') : t('conversations')}` },
    ...(running > 0 ? [{ text: t('%n running').replace('%n', String(running)) }] : []),
  ]
}

/** The rows, for the tile that counts them. `enabled` keeps the mosaic from
    fetching what an open page already shows. `settled` is true once the read
    answered or failed; a failure leaves no rows, and no rows means no chip. */
export function useDelegationRows(
  fetchImpl: typeof fetch,
  enabled: boolean,
): { readonly rows: readonly DelegationRow[] | undefined; readonly settled: boolean } {
  const read = useRequest<{ delegations?: readonly DelegationRow[] }>(fetchImpl, '/api/delegations', { enabled })
  return {
    rows: read.status === 'ready' ? (read.data?.delegations ?? []) : undefined,
    settled: !enabled || read.status !== 'loading',
  }
}

/** When a conversation last moved, in the reader's locale — date only once it is
    old news: the hour matters on the day itself and is noise a week later. */
export function lastMoved(updatedAt: string, locale?: string, now = new Date()): string {
  const at = new Date(updatedAt)
  if (Number.isNaN(at.getTime())) return ''
  return at.toDateString() === now.toDateString()
    ? at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleDateString(locale)
}

export interface DelegationsProps {
  /** The open conversation, from the address: `<caller>/<id>`. */
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
  // The list is read again each time the address comes back to it, as before.
  const list = useRequest<{ delegations?: readonly DelegationRow[] }>(fetchImpl, '/api/delegations', {
    enabled: !open,
    t,
  })
  const item = useRequest<Delegation>(
    fetchImpl,
    `/api/delegations/${(open ?? '').split('/').map(encodeURIComponent).join('/')}`,
    { enabled: Boolean(open), t },
  )
  const rows = list.status === 'ready' ? (list.data?.delegations ?? []) : undefined
  const delegation = item.status === 'ready' ? item.data : undefined

  if (open && item.status === 'loading') {
    return <div className="adestia-deleg"><Loading t={t} /></div>
  }
  if (open && item.status === 'failed') {
    return (
      <div className="adestia-deleg">
        <ReadFailure message={item.error ?? ''} httpStatus={item.httpStatus} onRetry={item.retry} t={t} />
      </div>
    )
  }

  if (open && delegation) {
    return (
      <div className="adestia-deleg">
        <header className="adestia-chead">
          <span className="adestia-chead__icon" aria-hidden="true">
            <Icon name="handshake" />
          </span>
          <div>
            <h1 className="adestia-chead__title">{delegation.title}</h1>
            {/* Why there is no composer under this conversation, said where the
                composer would be looked for. */}
            <p className="adestia-chead__lede">
              {t('Read-only — this conversation belongs to')} {delegation.caller}
            </p>
          </div>
        </header>
        <div className="adestia-chat__conversation adestia-deleg__conversation">
          {delegation.messages.map((message) => (
            <Bubble key={message.id} message={toMessage(message, { signatures: false })} t={t} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="adestia-deleg">
      <header className="adestia-chead">
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="handshake" />
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Delegations')}</h1>
          <p className="adestia-chead__lede">{t('What other agents asked this one to do')}</p>
        </div>
      </header>

      {list.status === 'loading' && <Loading t={t} />}
      {list.status === 'failed' && (
        <ReadFailure message={list.error ?? ''} httpStatus={list.httpStatus} onRetry={list.retry} t={t} />
      )}
      {rows !== undefined && rows.length === 0 && (
        <EmptyState
          icon="handshake"
          text={t('No delegated task yet — the conversations other agents open here will appear by caller.')}
        />
      )}

      {groupByCaller(rows ?? []).map((group) => (
        <section key={group.caller} className="adestia-deleg__group">
          <h2 className="adestia-deleg__caller">{group.caller}</h2>
          <ul className="adestia-conversations">
            {group.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="adestia-conversations__item"
                  onClick={() => onOpen(`${group.caller}/${row.id}`)}
                >
                  {row.title}
                  {/* The state is a chip with its own icon: the colour never
                      says it alone. The same two states the chat's dots tell. */}
                  {row.turn && (
                    <span className={`adestia-deleg__state adestia-deleg__state--${row.turn}`}>
                      <Icon
                        name={row.turn === 'waiting' ? 'circle-alert' : 'loader-circle'}
                        {...(row.turn === 'waiting' ? {} : { className: 'adestia-icon--spin' })}
                      />
                      {t(row.turn === 'waiting' ? 'waiting' : 'running')}
                    </span>
                  )}
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
