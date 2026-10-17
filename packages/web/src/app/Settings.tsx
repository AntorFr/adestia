/**
 * Arming the driver's credential without a terminal.
 *
 * The flow is rendered from the driver's `mode`, never from its name — the
 * same panel serves a paste-a-code flow and a device-code one, and a third
 * engine needs no change here.
 *
 * It draws inside the cog menu (`SettingsMenu`), which is why it heads
 * nothing: the menu says what this block is, once. A person opens it because
 * something has just stopped working, so it has to be answerable from
 * wherever they were standing rather than behind a navigation.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { Icon } from './Icon.js'
import type { IconName } from './icons.js'
import { jsonInit, requestJson } from './request.js'
import { Button, Field } from './ui/index.js'

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

/**
 * One line of the token's state: an icon and a sentence, so the state is told
 * by its shape and its words and never by the colour alone (E-15).
 */
function Token({
  icon,
  tone,
  spin,
  children,
}: {
  readonly icon: IconName
  readonly tone?: 'ok' | 'error'
  readonly spin?: boolean
  readonly children: ReactNode
}) {
  return (
    <span className={tone ? `adestia-save adestia-token adestia-token--${tone}` : 'adestia-save adestia-token'}>
      <Icon name={icon} {...(spin ? { className: 'adestia-icon--spin' } : {})} />
      <span>{children}</span>
    </span>
  )
}

export function StatusLine({
  status,
  t = (key) => key,
  locale,
}: {
  status: AuthStatus | undefined
  t?: (key: string) => string
  locale?: string
}) {
  if (!status)
    return (
      <Token icon="loader-circle" spin>
        {t('Checking…')}
      </Token>
    )
  switch (status.state) {
    case 'armed':
      return (
        <Token icon="check" tone="ok">
          {t('Armed')}
          {status.savedAt ? ` — ${new Date(status.savedAt).toLocaleDateString(locale)}` : ''}
        </Token>
      )
    case 'invalid':
      return (
        <Token icon="circle-alert" tone="error">
          {status.reason ?? t('Refused upstream')}
        </Token>
      )
    case 'absent':
      return (
        <Token icon="key-round">
          {/* Not an error: the CLI may be living on credentials set up outside
              Adestia, and saying "missing" would send someone fixing what works. */}
          {status.source === 'cli-native'
            ? t('Using the CLI’s own credentials')
            : t('No token stored here')}
        </Token>
      )
    default:
      return (
        <Token icon="info">{t('Unknown')}</Token>
      )
  }
}

/** Puts nodes where a translated sentence has `%name` markers, so word order is the language's. */
function weave(sentence: string, parts: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return sentence
    .split(/(%[a-z]+)/)
    .map((piece, index) => {
      const part = piece.startsWith('%') ? parts[piece.slice(1)] : undefined
      return part === undefined ? piece : <span key={index}>{part}</span>
    })
}

/** One outbound MCP server, as the driver reports it. */
export interface McpServerHealth {
  readonly name: string
  readonly state: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | 'unknown'
  readonly error?: string
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
      // No report, no panel: a failure is silence here.
      const result = await requestJson<{ servers?: readonly McpServerHealth[] }>(fetchImpl, '/api/mcp/status')
      if (live && result.ok) setServers(result.data?.servers ?? [])
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, enabled])

  return servers
}

export function Settings({
  fetchImpl = fetch,
  t = (key) => key,
  locale,
}: {
  fetchImpl?: typeof fetch
  locale?: string
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
    const result = await requestJson<AuthStatus>(fetchImpl, '/api/auth/driver', undefined, t)
    // 404 means this engine cannot be armed from here at all — a different
    // fact from "has no token", and the panel must not offer a button that
    // can never work.
    if (!result.ok && result.status === 404) {
      setSupported(false)
      return
    }
    if (result.ok) setStatus(result.data)
  }, [fetchImpl, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const begin = useCallback(async () => {
    setPhase({ kind: 'starting' })
    setConsented(false)
    const result = await requestJson<AuthPrompt>(fetchImpl, '/api/auth/driver/begin', jsonInit('POST'), t)
    if (!result.ok) {
      setPhase({ kind: 'failed', message: result.error })
      return
    }
    setPhase({ kind: 'awaiting', prompt: result.data })
  }, [fetchImpl, t])

  const complete = useCallback(
    async (prompt: AuthPrompt) => {
      setPhase({ kind: 'exchanging', prompt })
      // A device code is approved in a browser, with nothing to copy back;
      // the server still requires a non-empty field, so send a sentinel.
      const result = await requestJson(
        fetchImpl,
        '/api/auth/driver/complete',
        jsonInit('POST', {
          sessionId: prompt.sessionId,
          input: prompt.mode === 'device-code' ? 'approved' : code,
        }),
        t,
      )
      if (!result.ok) {
        setPhase({ kind: 'failed', message: result.error })
        return
      }
      setCode('')
      setConsented(false)
      setPhase({ kind: 'idle' })
      await refresh()
    },
    [code, fetchImpl, refresh, t],
  )

  const cancel = useCallback(
    async (prompt: AuthPrompt) => {
      setPhase({ kind: 'idle' })
      setCode('')
      setConsented(false)
      await requestJson(fetchImpl, '/api/auth/driver/cancel', jsonInit('POST', { sessionId: prompt.sessionId }), t)
    },
    [fetchImpl, t],
  )

  const clear = useCallback(async () => {
    await requestJson(fetchImpl, '/api/auth/driver', jsonInit('DELETE'), t)
    await refresh()
  }, [fetchImpl, refresh, t])

  if (!supported) {
    return (
      <section className="adestia-settings">
        <p className="adestia-empty__hint">
          {t('This engine takes its credentials from the environment; there is nothing to arm here.')}
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
        <StatusLine status={status} t={t} {...(locale ? { locale } : {})} />
      </header>

      {phase.kind === 'failed' && (
        <p className="adestia-save adestia-token adestia-token--error" role="alert">
          <Icon name="circle-alert" />
          <span>{phase.message}</span>
        </p>
      )}

      {!active && (
        <div className="adestia-settings__actions">
          <Button
            variant={status?.state === 'armed' ? 'neutral' : 'accent'}
            icon="key-round"
            onClick={() => void begin()}
            disabled={phase.kind === 'starting'}
            busy={phase.kind === 'starting'}
          >
            {status?.state === 'armed' ? t('Renew the token') : t('Arm a token')}
          </Button>
          {status?.state === 'armed' && (
            <Button variant="ghost" onClick={() => void clear()}>
              {t('Forget it')}
            </Button>
          )}
        </div>
      )}

      {active && (
        <ol className="adestia-arming">
          <li>
            {active.mode === 'device-code'
              ? weave(t('Open %link and enter the code %code'), {
                  link: (
                    <a href={active.authorizeUrl} target="_blank" rel="noreferrer">
                      {t('the sign-in page')}
                    </a>
                  ),
                  code: <code>{active.userCode}</code>,
                })
              : weave(t('Open %link and approve the request'), {
                  link: (
                    <a href={active.authorizeUrl} target="_blank" rel="noreferrer">
                      {t('this authorisation link')}
                    </a>
                  ),
                })}
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
                <Button variant="ghost" onClick={() => void cancel(active)}>
                  {t('Cancel')}
                </Button>
                <Button
                  variant="accent"
                  onClick={() => void complete(active)}
                  disabled={consentPending || phase.kind === 'exchanging'}
                  busy={phase.kind === 'exchanging'}
                >
                  {phase.kind === 'exchanging' ? t('Finishing…') : t('I have approved — finish')}
                </Button>
              </div>
            ) : (
              <>
                <Field label={active.inputLabel ?? t('Paste the code you were given')}>
                  <input
                    className="adestia-input adestia-arming__input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <div className="adestia-settings__actions">
                  <Button variant="ghost" onClick={() => void cancel(active)}>
                    {t('Cancel')}
                  </Button>
                  <Button
                    variant="accent"
                    onClick={() => void complete(active)}
                    disabled={code.trim() === '' || consentPending || phase.kind === 'exchanging'}
                    busy={phase.kind === 'exchanging'}
                  >
                    {phase.kind === 'exchanging' ? t('Exchanging…') : t('Validate')}
                  </Button>
                </div>
              </>
            )}
          </li>
        </ol>
      )}
    </section>
  )
}
