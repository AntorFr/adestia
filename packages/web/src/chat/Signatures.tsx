/**
 * The signatures the hub's façade asked for, and the sheet they are given in.
 *
 * A tool call held at the façade (Tessera) used to reach the person only as a
 * link — if the model thought to repeat it — that opened a new tab and left
 * the agent waiting on a message nobody knew to send. The driver now reads the
 * ceremony out of the tool result, and the thread draws it here.
 *
 * WHAT THIS IS NOT: a signing surface. The ceremony stays on Tessera's origin,
 * where the passkey is bound and where the description of what is being signed
 * is rendered; the sheet frames that page and never draws a word of its own
 * about the action. Everything it learns back is a stage name (`loaded`,
 * `assertion_ok`, `denied`…), which is why a forged one is harmless: at worst
 * it makes the agent call again, and the façade refuses a call nobody signed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StoredSignature } from '@antorfr/adestia-schemas'

export type Signature = StoredSignature

/** How the instance opens a ceremony — see `signatures.embed` in the config. */
export interface SigningOptions {
  readonly embed: boolean
  /** A signature was given here. The chat decides what follows. */
  readonly onSigned: (signature: Signature) => void
}

type Settled = 'signed' | 'denied'

const STORE_KEY = 'adestia.signatures'

/**
 * What this browser saw become of a ceremony.
 *
 * A convenience, not a record: Tessera holds the truth, and a card that forgot
 * it was signed only offers a button whose page then says "approved". Kept in
 * local storage so a reload does not re-offer every signature of the day.
 */
function loadSettled(): Record<string, Settled> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Settled>) : {}
  } catch {
    return {}
  }
}

function saveSettled(id: string, state: Settled): void {
  try {
    const all = loadSettled()
    all[id] = state
    // Bounded: the ids of last month's signatures are worth nothing.
    const kept = Object.entries(all).slice(-200)
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* storage refused: the card forgets on reload, Tessera does not */
  }
}

/** Shared by every card of the page, so a signature settles everywhere at once. */
const listeners = new Set<() => void>()

function settle(id: string, state: Settled): void {
  saveSettled(id, state)
  for (const listener of [...listeners]) listener()
}

function useSettled(): Record<string, Settled> {
  const [settled, setSettled] = useState(loadSettled)
  useEffect(() => {
    const listener = () => setSettled(loadSettled())
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return settled
}

function expired(signature: Signature, now: number): boolean {
  if (!signature.expiresAt) return false
  const at = Date.parse(signature.expiresAt)
  return Number.isFinite(at) && at < now
}

function when(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return undefined
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay
    ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

/** What a card says, by what became of it — the card itself never shrinks to a bare glyph. */
const TITLES: Record<'pending' | Settled | 'expired', Record<Signature['kind'], string>> = {
  pending: {
    consent: 'A held action waits for your signature.',
    grant: 'A standing authorisation asks for your signature.',
  },
  signed: { consent: 'Action signed — the agent resumes it.', grant: 'Authorisation signed.' },
  denied: { consent: 'Signature refused.', grant: 'Signature refused.' },
  expired: { consent: 'Request lapsed unsigned.', grant: 'Request lapsed unsigned.' },
}

/** The host a ceremony is served from — said on the card and on the sheet. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * The cards for one message's signatures.
 *
 * Drawn under the message whose tools asked, because that is where the agent
 * says what it was trying to do.
 */
export function SignatureCards({
  signatures,
  signing,
  t = (key) => key,
}: {
  signatures: readonly Signature[] | undefined
  signing: SigningOptions | undefined
  t?: (key: string) => string
}) {
  const settled = useSettled()
  const [open, setOpen] = useState<Signature | undefined>()
  /** Opened in a tab: the shell has no way to hear the outcome, so it asks. */
  const [inTab, setInTab] = useState<ReadonlySet<string>>(new Set())
  if (!signing || !signatures || signatures.length === 0) return null

  const signed = (signature: Signature) => {
    if (loadSettled()[signature.id] === 'signed') return
    settle(signature.id, 'signed')
    signing.onSigned(signature)
  }

  const begin = (signature: Signature) => {
    if (signing.embed) {
      setOpen(signature)
      return
    }
    window.open(signature.url, '_blank', 'noopener')
    setInTab((current) => new Set(current).add(signature.id))
  }

  const now = Date.now()
  return (
    <>
      {signatures.map((signature) => {
        const state = settled[signature.id] ?? (expired(signature, now) ? 'expired' : 'pending')
        const until = when(signature.expiresAt)
        return (
          <div
            key={signature.id}
            className={`adestia-sign adestia-sign--${state}`}
            role={state === 'pending' ? 'group' : 'status'}
            aria-label={t('Signature requested')}
          >
            <span className="adestia-sign__glyph" aria-hidden="true">
              {state === 'signed' ? '✓' : state === 'denied' ? '✕' : state === 'expired' ? '⌛' : '✍'}
            </span>
            <span className="adestia-sign__text">
              <strong>{t(TITLES[state][signature.kind])}</strong>
              <span className="adestia-sign__meta">
                {hostOf(signature.url)}
                {state === 'pending' && until && ` · ${t('until')} ${until}`}
              </span>
            </span>
            {state === 'pending' && (
              <span className="adestia-sign__actions">
                {inTab.has(signature.id) && signature.kind === 'consent' && (
                  <button type="button" onClick={() => signed(signature)}>
                    {t('I signed it')}
                  </button>
                )}
                <button type="button" className="adestia-sign__go" onClick={() => begin(signature)}>
                  {t('Sign')}
                </button>
              </span>
            )}
          </div>
        )
      })}
      {open && (
        <SignatureSheet
          signature={open}
          t={t}
          onClose={() => setOpen(undefined)}
          onSigned={() => signed(open)}
          onDenied={() => settle(open.id, 'denied')}
        />
      )}
    </>
  )
}

/** How long the ceremony gets to say it loaded before the tab is suggested. */
const LOAD_GRACE_MS = 6000

/**
 * The ceremony, framed over the chat.
 *
 * Only the frame's own messages are heard: the origin must be the ceremony's
 * and the source the frame's window. Tessera sends stage names with a wildcard
 * target, which is safe for IT because they carry nothing — and this end still
 * checks, so another frame of the page cannot close the sheet or fake a
 * signature's relaunch.
 */
export function SignatureSheet({
  signature,
  onClose,
  onSigned,
  onDenied,
  t = (key) => key,
}: {
  signature: Signature
  onClose: () => void
  onSigned: () => void
  onDenied: () => void
  t?: (key: string) => string
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [troubled, setTroubled] = useState(false)
  const origin = (() => {
    try {
      return new URL(signature.url).origin
    } catch {
      return ''
    }
  })()

  // The latest handlers, read when a message arrives: one listener lives for
  // the whole sheet, and re-subscribing on every render would open a gap in
  // which a stage could be missed.
  const handlers = useRef({ onClose, onSigned, onDenied })
  handlers.current = { onClose, onSigned, onDenied }
  const close = useCallback(() => handlers.current.onClose(), [])
  const loadedRef = useRef(false)
  loadedRef.current = loaded

  useEffect(() => {
    const timers: number[] = []
    const hear = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return
      const data = event.data as { source?: unknown; stage?: unknown } | null
      if (!data || data.source !== 'tessera-ceremony') return
      switch (data.stage) {
        case 'loaded':
          setLoaded(true)
          break
        case 'assertion_ok':
          handlers.current.onSigned()
          // Long enough to read the page's own "approved" after it reloads.
          timers.push(window.setTimeout(() => handlers.current.onClose(), 1200))
          break
        case 'denied':
          handlers.current.onDenied()
          timers.push(window.setTimeout(() => handlers.current.onClose(), 800))
          break
        case 'assertion_err':
          setTroubled(true)
          break
      }
    }
    window.addEventListener('message', hear)
    timers.push(window.setTimeout(() => setTroubled((was) => was || !loadedRef.current), LOAD_GRACE_MS))
    return () => {
      window.removeEventListener('message', hear)
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [origin])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Portalled to the body: the shell folds its panes with transforms on a
  // phone, and a fixed element inside a transformed one is fixed to THAT —
  // the sheet came out as wide as both panes, its close button off-screen.
  return createPortal(
    <div className="adestia-sheet" onClick={close}>
      <div
        className="adestia-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('Signature')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="adestia-sheet__head">
          {/* The origin, said out loud: the page below is the authority, and
              where it comes from is the one thing the frame cannot show. */}
          <span className="adestia-sheet__origin">🔒 {hostOf(signature.url)}</span>
          <a
            className="adestia-sheet__tab"
            href={signature.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            {t('Open in a tab')} ↗
          </a>
          <button type="button" className="adestia-sheet__close" aria-label={t('Close')} onClick={close}>
            ✕
          </button>
        </header>
        {troubled && (
          <p className="adestia-sheet__hint">
            {t('If the passkey does not open here, sign in a tab instead.')}
          </p>
        )}
        <iframe
          ref={frame}
          className="adestia-sheet__frame"
          src={signature.url}
          title={t('Signature ceremony')}
          allow="publickey-credentials-get"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>,
    document.body,
  )
}
