/**
 * The servers this instance can call, as a screen you can act on.
 *
 * What it replaces was a read-only list of names and states, stacked under
 * the credential panel. It answered "is anything broken" and nothing else:
 * you could see that a server needed a sign-in, and there was no way from
 * there to see what that server even was, let alone add one. Wiring an MCP
 * server meant a text editor, a config file and a restart — which is fine for
 * the operator who deployed the instance and impossible for anybody else.
 *
 * So: a tile per server, dressed like every other tile in this product, and
 * the tile opens the DECLARATION. Three things follow from that, and each is
 * a rule rather than a detail.
 *
 * **A server says where it came from.** Config, plugin or added here — and
 * only the last is editable. A screen that let you type into a plugin's
 * server would be a screen offering an edit that the next start throws away,
 * which is the same mistake the instruction zone made and fixed.
 *
 * **Secrets come back masked, and go out masked.** The bullets in `env`, in
 * `headers` and in `auth` are not decoration: the server never sends the real
 * value, and a value posted back still equal to the mask means "keep the one
 * you are holding". So somebody can fix a typo in a URL without being asked
 * to re-type a token they may not have any more.
 *
 * **The config is edited as config.** A form with a field per option would
 * have to know every option, and would quietly drop the one it did not know
 * about — `auth`, say, which is the whole reason a hub works. The declaration
 * is a small JSON object; the screen shows it, and the server judges what
 * comes back with the very same grammar the YAML file goes through.
 */

import { useCallback, useEffect, useState } from 'react'

import { Tile } from './Tile.js'
import { useMcpServers, type McpServerHealth } from './Settings.js'

/** Where a server was declared. Only `ui` is this screen's to change. */
type McpSource = 'config' | 'plugin' | 'ui'

export interface McpServerView {
  readonly name: string
  readonly source: McpSource
  readonly owner?: string
  readonly editable: boolean
  readonly transport: 'stdio' | 'http'
  readonly config: Readonly<Record<string, unknown>>
  readonly shadowed?: boolean
}

/** How each state reads, and which of the three tones it wears. */
const STATES: Readonly<
  Record<McpServerHealth['state'], { readonly tone: string; readonly label: string }>
> = {
  connected: { tone: 'settled', label: 'connected' },
  failed: { tone: 'waiting', label: 'failed' },
  // Not a failure: a job for a person. Painted red, it sends somebody
  // debugging a network while a server waits to be logged into.
  'needs-auth': { tone: 'waiting', label: 'needs a sign-in' },
  pending: { tone: 'underway', label: 'starting' },
  disabled: { tone: 'underway', label: 'disabled' },
  unknown: { tone: 'underway', label: 'not observed yet' },
}

/** What a source reads as, in one line, on the screen that opened it. */
function provenance(view: McpServerView, t: (key: string) => string): string {
  if (view.source === 'config') return t('Declared in the instance configuration')
  if (view.source === 'plugin') {
    return `${t('Brought by the plugin')} “${view.owner ?? '?'}”`
  }
  return t('Added from here')
}

/** A server nobody has written yet. Both transports in one comment, not two. */
const TEMPLATE = `{
  "name": "",
  "command": "npx",
  "args": ["-y", "some-mcp-server"]
}`

type Save =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly message: string }

export interface McpServersProps {
  /** The server whose declaration is open, from the address. */
  readonly open?: string | undefined
  readonly onOpen: (name: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

export function McpServers({
  open,
  onOpen,
  fetchImpl = fetch,
  t = (key) => key,
}: McpServersProps) {
  const [views, setViews] = useState<readonly McpServerView[] | undefined>()
  /**
   * The new-server form, which is deliberately NOT in the address.
   *
   * Every other state of this product is: the URL is the navigation, all of
   * it. A blank form is not a place — nothing links to it, a reload of it
   * would restore an empty box under a name that means nothing — and giving
   * it a segment would also mean reserving a name a real server could take.
   */
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [onServer, setOnServer] = useState('')
  const [save, setSave] = useState<Save>({ kind: 'idle' })

  const health = useMcpServers(fetchImpl)

  const refresh = useCallback(async () => {
    const response = await fetchImpl('/api/mcp/servers')
    if (!response.ok) return
    const body = (await response.json()) as { servers?: readonly McpServerView[] }
    setViews(body.servers ?? [])
  }, [fetchImpl])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const shown = views?.find((view) => view.name === open)

  // Re-seeded whenever the opened server changes, never on every render: the
  // textarea is what somebody is typing into, and rebuilding it from the
  // fetched declaration would erase their edit at the next poll.
  useEffect(() => {
    if (adding) return
    const text = shown ? `${JSON.stringify(shown.config, null, 2)}\n` : ''
    setDraft(text)
    setOnServer(text)
    setSave({ kind: 'idle' })
  }, [shown, adding])

  const beginAdding = useCallback(() => {
    onOpen(undefined)
    setAdding(true)
    setDraft(`${TEMPLATE}\n`)
    setOnServer('')
    setSave({ kind: 'idle' })
  }, [onOpen])

  const commit = useCallback(async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (error) {
      // Caught here rather than posted: a JSON error is about what is on this
      // screen, and a round trip would answer it with a 400 that says less.
      setSave({ kind: 'failed', message: (error as Error).message })
      return
    }
    setSave({ kind: 'saving' })
    const response = await fetchImpl(
      adding ? '/api/mcp/servers' : `/api/mcp/servers/${encodeURIComponent(open ?? '')}`,
      {
        method: adding ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setSave({ kind: 'failed', message: body.error ?? `refused (${response.status})` })
      return
    }
    const body = (await response.json()) as { server?: { name?: string } }
    setOnServer(draft)
    setSave({ kind: 'saved' })
    setAdding(false)
    await refresh()
    // The name may have changed under us — a rename is a legitimate edit —
    // so the address follows what came back rather than what was typed.
    if (body.server?.name) onOpen(body.server.name)
  }, [adding, draft, fetchImpl, onOpen, open, refresh])

  const remove = useCallback(async () => {
    if (!open) return
    const response = await fetchImpl(`/api/mcp/servers/${encodeURIComponent(open)}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setSave({ kind: 'failed', message: body.error ?? `refused (${response.status})` })
      return
    }
    onOpen(undefined)
    await refresh()
  }, [fetchImpl, onOpen, open, refresh])

  if (adding || shown) {
    const state = health?.find((entry) => entry.name === shown?.name)
    const tone = state ? STATES[state.state] ?? STATES.unknown : undefined
    const editable = adding || shown?.editable === true
    const dirty = draft !== onServer

    return (
      <section className="adestia-mcp">
        {/* No back button of its own: the shell draws one, and it climbs one
            level. Two of them stacked is what this screen shipped with. */}
        <header className="adestia-chead">
          <span className="adestia-chead__icon" aria-hidden="true">
            🔌
          </span>
          <div>
            <h1 className="adestia-chead__title">
              {adding ? t('A new server') : shown?.name}
            </h1>
            <p className="adestia-chead__lede">
              {adding
                ? t('Written here, kept beside the instance data — not in the configuration file.')
                : shown
                  ? `${provenance(shown, t)} · ${shown.transport === 'http' ? t('over HTTP') : t('a local process')}`
                  : ''}
            </p>
          </div>
        </header>

        {tone && (
          <p className="adestia-mcp__state">
            <span className={`adestia-stat adestia-stat--${tone.tone}`}>{t(tone.label)}</span>
            {/* Only ever what the CLI said. A reason is never invented. */}
            {state?.error && <span className="adestia-mcp__why">{state.error}</span>}
          </p>
        )}

        {shown?.shadowed && (
          <p className="adestia-save adestia-save--error" role="alert">
            {t('The configuration file now declares this name too, and it wins — this one is not wired.')}
          </p>
        )}

        {!editable && (
          <p className="adestia-mcp__note">
            {t('Read-only here: this one is declared elsewhere, and an edit would be undone at the next start.')}
          </p>
        )}

        <textarea
          className="adestia-mcp__config"
          value={draft}
          spellCheck={false}
          readOnly={!editable}
          aria-label={t('Server declaration')}
          onChange={(event) => {
            setDraft(event.target.value)
            if (save.kind !== 'idle') setSave({ kind: 'idle' })
          }}
        />

        {editable && (
          <div className="adestia-mcp__bar">
            {save.kind === 'failed' && (
              <span className="adestia-save adestia-save--error" role="alert">
                {save.message}
              </span>
            )}
            {save.kind === 'saved' && !dirty && <span className="adestia-save">{t('Saved')}</span>}
            <span style={{ flex: 1 }} />
            {!adding && (
              <button type="button" className="adestia-mcp__drop" onClick={() => void remove()}>
                {t('Remove')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void commit()}
              disabled={!dirty || save.kind === 'saving'}
            >
              {save.kind === 'saving' ? t('Saving…') : t('Save')}
            </button>
          </div>
        )}

        {tone && (
          <p className="adestia-mcp__note">
            {t('Reported when a turn last ran — the CLI loads them with the session.')}
          </p>
        )}
      </section>
    )
  }

  return (
    <div className="adestia-prefs adestia-prefs__page">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-indigo, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          🔌
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('MCP servers')}</h1>
          <p className="adestia-chead__lede">
            {t('What this instance reaches, and what it is doing about it')}
          </p>
        </div>
      </header>

      {views !== undefined && views.length === 0 && (
        <p className="adestia-instructions__empty">
          {t('None wired yet — add one, or declare it in the configuration file.')}
        </p>
      )}

      <ul className="adestia-tiles">
        {(views ?? []).map((view) => {
          const state = health?.find((entry) => entry.name === view.name)
          const tone = state ? STATES[state.state] ?? STATES.unknown : undefined
          return (
            <Tile
              key={view.name}
              icon="🔌"
              hue={view.source === 'ui' ? 'indigo' : 'ardoise'}
              label={view.name}
              subtitle={view.transport === 'http' ? t('over HTTP') : t('a local process')}
              chips={[
                ...(tone
                  ? [{ text: t(tone.label), hot: state?.state === 'failed' || state?.state === 'needs-auth' }]
                  : []),
                ...(view.editable ? [] : [{ text: t('read-only') }]),
              ]}
              onOpen={() => onOpen(view.name)}
              t={t}
            />
          )
        })}
        <Tile
          key="+"
          icon="＋"
          hue="indigo"
          label={t('Add a server')}
          subtitle={t('stdio or HTTP')}
          onOpen={beginAdding}
          t={t}
        />
      </ul>
    </div>
  )
}
