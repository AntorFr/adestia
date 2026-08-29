/**
 * Settings: arming the driver's credential without a terminal.
 *
 * The flow is rendered from the driver's `mode`, never from its name — the
 * same panel serves a paste-a-code flow and a device-code one, and a third
 * engine needs no change here.
 */

import { useCallback, useEffect, useState } from 'react'

export interface AuthStatus {
  readonly state: 'absent' | 'armed' | 'invalid' | 'unknown'
  readonly source: 'managed' | 'cli-native'
  readonly savedAt?: string
  readonly reason?: string
}

export interface AuthPrompt {
  readonly sessionId: string
  readonly mode: 'url+code' | 'device-code' | 'api-key'
  readonly authorizeUrl?: string
  readonly userCode?: string
  readonly inputLabel?: string
  /** A statement the user must accept before the flow may finish. */
  readonly consent?: string
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'awaiting'; readonly prompt: AuthPrompt }
  | { readonly kind: 'exchanging'; readonly prompt: AuthPrompt }
  | { readonly kind: 'failed'; readonly message: string }

export function StatusLine({
  status,
  t = (key) => key,
}: {
  status: AuthStatus | undefined
  t?: (key: string) => string
}) {
  if (!status) return <span className="adestia-save">{t('Checking…')}</span>
  switch (status.state) {
    case 'armed':
      return (
        <span className="adestia-save adestia-save--ok">
          {t('Armed')}
          {status.savedAt ? ` — ${new Date(status.savedAt).toLocaleDateString()}` : ''}
        </span>
      )
    case 'invalid':
      return (
        <span className="adestia-save adestia-save--error">{status.reason ?? t('Refused upstream')}</span>
      )
    case 'absent':
      return (
        <span className="adestia-save">
          {/* Not an error: the CLI may be living on credentials set up outside
              Adestia, and saying "missing" would send someone fixing what works. */}
          {status.source === 'cli-native'
            ? t('Using the CLI’s own credentials')
            : t('No token stored here')}
        </span>
      )
    default:
      return <span className="adestia-save">{t('Unknown')}</span>
  }
}

/** One outbound MCP server, as the driver reports it. */
export interface McpServerHealth {
  readonly name: string
  readonly state: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | 'unknown'
  readonly error?: string
}

/**
 * How each state reads, and which of the three tones it wears.
 *
 * `needs-auth` is the one worth naming: it is not a failure, it is a job for a
 * person, and painting it red would send somebody debugging a network while a
 * server waits to be logged into. `unknown` is not red either — nothing has
 * been observed yet, which is a fact about this instance rather than about the
 * server.
 */
const MCP_STATES: Readonly<
  Record<McpServerHealth['state'], { readonly tone: string; readonly label: string }>
> = {
  connected: { tone: 'settled', label: 'connected' },
  failed: { tone: 'waiting', label: 'failed' },
  'needs-auth': { tone: 'waiting', label: 'needs a sign-in' },
  pending: { tone: 'underway', label: 'starting' },
  disabled: { tone: 'underway', label: 'disabled' },
  unknown: { tone: 'underway', label: 'not observed yet' },
}

/**
 * What the driver says about its outbound MCP servers.
 *
 * `undefined` is a THIRD answer, distinct from the empty list: it means the
 * engine does not report at all (a 404), where `[]` means it reports and has
 * none. The settings screen needs that distinction to decide whether an MCP
 * row is worth offering, and the panel needs it to decide whether to draw —
 * so the fetch lives here, once, rather than in both.
 */
export function useMcpServers(
  fetchImpl: typeof fetch = fetch,
  /** False when the caller already holds the answer — no second request. */
  enabled = true,
): readonly McpServerHealth[] | undefined {
  const [servers, setServers] = useState<readonly McpServerHealth[] | undefined>()

  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    void (async () => {
      try {
        const response = await fetchImpl('/api/mcp/status')
        if (!response.ok) return
        const body = (await response.json()) as { servers?: readonly McpServerHealth[] }
        if (live) setServers(body.servers ?? [])
      } catch {
        /* no report, no panel */
      }
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, enabled])

  return servers
}

/**
 * The outbound MCP servers this instance wired, and what they are doing.
 *
 * Absent entirely when the driver cannot report — a 404 — rather than shown
 * empty: "this engine does not report" and "you have no servers" are different
 * facts, and one box cannot say both.
 */
export function McpPanel({
  fetchImpl = fetch,
  servers: given,
  t = (key) => key,
}: {
  fetchImpl?: typeof fetch
  /** Already fetched by the screen around it; asked for otherwise. */
  servers?: readonly McpServerHealth[] | undefined
  t?: (key: string) => string
}) {
  const fetched = useMcpServers(fetchImpl, given === undefined)
  const servers = given ?? fetched

  if (servers === undefined || servers.length === 0) return null

  // Untitled on purpose: this is a whole page now, and the screen around it
  // says its name once. It carried its own heading back when it was stacked
  // under the credential panel in a dialog.
  return (
    <section className="adestia-mcp">
      <ul>
        {servers.map((server) => {
          const shown = MCP_STATES[server.state] ?? MCP_STATES.unknown
          return (
            <li key={server.name}>
              <span className="adestia-mcp__name">{server.name}</span>
              <span className={`adestia-stat adestia-stat--${shown.tone}`}>{t(shown.label)}</span>
              {/* Only ever what the CLI said. A reason is never invented. */}
              {server.error && <span className="adestia-mcp__why">{server.error}</span>}
            </li>
          )
        })}
      </ul>
      <p className="adestia-mcp__note">
        {t('Reported when a turn last ran — the CLI loads them with the session.')}
      </p>
    </section>
  )
}

export function Settings({
  fetchImpl = fetch,
  t = (key) => key,
}: {
  fetchImpl?: typeof fetch
  /** The shell's translator; identity leaves every label in English. */
  t?: (key: string) => string
}) {
  const [status, setStatus] = useState<AuthStatus | undefined>()
  const [supported, setSupported] = useState(true)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [code, setCode] = useState('')
  // Never carried over from one flow to the next: consent is given for the
  // login being run now, not remembered as a preference.
  const [consented, setConsented] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetchImpl('/api/auth/driver')
    // 404 means this engine cannot be armed from here at all — a different
    // fact from "has no token", and the panel must not offer a button that
    // can never work.
    if (response.status === 404) {
      setSupported(false)
      return
    }
    if (response.ok) setStatus((await response.json()) as AuthStatus)
  }, [fetchImpl])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const begin = useCallback(async () => {
    setPhase({ kind: 'starting' })
    setConsented(false)
    const response = await fetchImpl('/api/auth/driver/begin', { method: 'POST' })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setPhase({ kind: 'failed', message: body.error ?? 'the flow could not be started' })
      return
    }
    setPhase({ kind: 'awaiting', prompt: (await response.json()) as AuthPrompt })
  }, [fetchImpl])

  const complete = useCallback(
    async (prompt: AuthPrompt) => {
      setPhase({ kind: 'exchanging', prompt })
      const response = await fetchImpl('/api/auth/driver/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // A device code is approved in a browser, with nothing to copy back;
        // the server still requires a non-empty field, so send a sentinel.
        body: JSON.stringify({
          sessionId: prompt.sessionId,
          input: prompt.mode === 'device-code' ? 'approved' : code,
        }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setPhase({ kind: 'failed', message: body.error ?? 'the code was refused' })
        return
      }
      setCode('')
      setConsented(false)
      setPhase({ kind: 'idle' })
      await refresh()
    },
    [code, fetchImpl, refresh],
  )

  const cancel = useCallback(
    async (prompt: AuthPrompt) => {
      setPhase({ kind: 'idle' })
      setCode('')
      setConsented(false)
      await fetchImpl('/api/auth/driver/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: prompt.sessionId }),
      })
    },
    [fetchImpl],
  )

  const clear = useCallback(async () => {
    await fetchImpl('/api/auth/driver', { method: 'DELETE' })
    await refresh()
  }, [fetchImpl, refresh])

  if (!supported) {
    return (
      <section className="adestia-settings">
        <h2>{t('Agent credential')}</h2>
        <p className="adestia-empty__hint">
          This engine takes its credentials from the environment; there is nothing to arm here.
        </p>
      </section>
    )
  }

  const active = phase.kind === 'awaiting' || phase.kind === 'exchanging' ? phase.prompt : undefined
  // A prompt that carries a statement cannot be finished until it is ticked:
  // the driver reads "finished" as "the user agreed", so an untickable box
  // would be consent nobody gave.
  const consentPending = active?.consent !== undefined && !consented

  return (
    <section className="adestia-settings">
      <header className="adestia-settings__header">
        <StatusLine status={status} t={t} />
      </header>

      {phase.kind === 'failed' && (
        <p className="adestia-save adestia-save--error" role="alert">
          {phase.message}
        </p>
      )}

      {!active && (
        <div className="adestia-settings__actions">
          <button type="button" onClick={() => void begin()} disabled={phase.kind === 'starting'}>
            {status?.state === 'armed' ? t('Renew the token') : t('Arm a token')}
          </button>
          {status?.state === 'armed' && (
            <button type="button" onClick={() => void clear()}>
              {t('Forget it')}
            </button>
          )}
        </div>
      )}

      {active && (
        <ol className="adestia-arming">
          <li>
            {active.mode === 'device-code' ? (
              <>
                Open <a href={active.authorizeUrl} target="_blank" rel="noreferrer">the sign-in page</a>{' '}
                and enter the code <code>{active.userCode}</code>
              </>
            ) : (
              <>
                Open{' '}
                <a href={active.authorizeUrl} target="_blank" rel="noreferrer">
                  this authorisation link
                </a>{' '}
                and approve the request
              </>
            )}
          </li>
          <li>
            {active.consent !== undefined && (
              <label className="adestia-arming__consent">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(event) => setConsented(event.target.checked)}
                />
                <span>{active.consent}</span>
              </label>
            )}
            {active.mode === 'device-code' ? (
              <div className="adestia-settings__actions">
                <button type="button" onClick={() => void cancel(active)}>
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void complete(active)}
                  disabled={consentPending || phase.kind === 'exchanging'}
                >
                  {phase.kind === 'exchanging' ? 'Finishing…' : 'I have approved — finish'}
                </button>
              </div>
            ) : (
              <>
                <label className="adestia-arming__label">
                  {active.inputLabel ?? t('Paste the code you were given')}
                  <input
                    className="adestia-arming__input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <div className="adestia-settings__actions">
                  <button type="button" onClick={() => void cancel(active)}>
                    {t('Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void complete(active)}
                    disabled={code.trim() === '' || consentPending || phase.kind === 'exchanging'}
                  >
                    {phase.kind === 'exchanging' ? 'Exchanging…' : 'Validate'}
                  </button>
                </div>
              </>
            )}
          </li>
        </ol>
      )}
    </section>
  )
}
