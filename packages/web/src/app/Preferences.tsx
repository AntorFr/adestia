/**
 * The settings APP — the half of settings that is content.
 *
 * Three moves got here, and the third is a correction of the second.
 *
 * A dialog first: the credential panel, an Instructions link and the MCP
 * readout stacked in the order they were written, so arming a token pushed
 * everything below it down and the MCP list sat under a dozen rows of status
 * where nobody scrolled to find it.
 *
 * Then a screen of rows, one per subject, each opening its own page — which
 * fixed the stacking and went one step too far. It swept the session-sized
 * switches onto the canvas with the rest: signing out, or checking whether
 * the agent's token is still good, became a NAVIGATION away from whatever you
 * were reading. Those belong behind the cog, answered where you stand, and
 * that is where they now are (`SettingsMenu`).
 *
 * What is left here is what needed the canvas in the first place: the servers
 * this instance reaches, and the prose it was told. Both are things you
 * browse, search and edit — content, not switches — so this screen is what
 * every other body of content in this product is, a mosaic of tiles. The rows
 * went with the switches: a row is a preferences idiom, and it made two
 * domains of this instance look like options in a dialog.
 *
 * Still controlled rather than self-navigating: the URL is the navigation
 * state of this product — all of it — and a screen keeping its own idea of
 * which page is open would be a second one to disagree with the address bar.
 */

import { useEffect, useState } from 'react'

import { Instructions } from './Instructions.js'
import { McpServers } from './McpServers.js'
import { Tile } from './Tile.js'
import { useMcpServers, type McpServerHealth } from './Settings.js'

/** Which settings page is open. `''` is the mosaic itself. */
export type PrefsPage = '' | 'mcp' | 'instructions'

/** The pages that have an address. A closed set: `#/settings/…` is public. */
const PAGES = ['mcp', 'instructions'] as const

/**
 * Whether a URL segment names a page.
 *
 * The address bar is user-writable, so `#/settings/whatever` has to resolve to
 * something. Answering here lets the shell send it back to the mosaic rather
 * than render a screen with nothing on it under a title that lies.
 */
export function isPrefsPage(value: string): value is Exclude<PrefsPage, ''> {
  return (PAGES as readonly string[]).includes(value)
}

/**
 * A tile's second line, from what this instance can actually check.
 *
 * Counted rather than described: "3 servers" is a fact, and a tile that
 * promised "manage your servers" would say the same thing on an instance with
 * none. The exception is what earns the rest of the sentence — a line that
 * always ended "— all well" is a line nobody reads.
 */
export function mcpLede(
  servers: readonly McpServerHealth[],
  t: (key: string) => string,
): string {
  const attention = servers.filter(
    (server) => server.state === 'failed' || server.state === 'needs-auth',
  ).length
  const counted = `${servers.length} ${servers.length === 1 ? t('server') : t('servers')}`
  return attention > 0
    ? `${counted} — ${t('%n need attention').replace('%n', String(attention))}`
    : counted
}

/** What the screen is called, for the page now open. */
export function prefsTitle(page: PrefsPage, t: (key: string) => string): string {
  if (page === 'mcp') return t('MCP servers')
  if (page === 'instructions') return t('Instructions')
  return t('Settings')
}

/**
 * How many of a thing there are, for a tile that would otherwise say nothing.
 *
 * A failure is silence, never a zero: "0 instructions" on an engine that
 * cannot report them is a lie a tile has no business telling.
 */
function useCount(
  url: string,
  field: string,
  fetchImpl: typeof fetch,
): number | undefined {
  const [count, setCount] = useState<number | undefined>()
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const response = await fetchImpl(url)
        if (!response.ok) return
        const body = (await response.json()) as Record<string, unknown>
        const list = body[field]
        if (live && Array.isArray(list)) setCount(list.length)
      } catch {
        /* no figure, no chip */
      }
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, url, field])
  return count
}

export interface PreferencesProps {
  readonly page: PrefsPage
  readonly onPage: (page: PrefsPage) => void
  /** What is open INSIDE the page: a server's name, an instruction's path. */
  readonly item?: string | undefined
  readonly onItem: (item: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
  readonly locale?: string
}

export function Preferences({
  page,
  onPage,
  item,
  onItem,
  fetchImpl = fetch,
  t = (key) => key,
  locale,
}: PreferencesProps) {
  const health = useMcpServers(fetchImpl, page === '')
  const servers = useCount('/api/mcp/servers', 'servers', fetchImpl)
  const written = useCount('/api/instructions', 'files', fetchImpl)

  if (page === 'instructions') {
    return (
      <div
        className="adestia-prefs adestia-prefs__page"
        style={{ '--tile-color': 'var(--adestia-hue-bleu, var(--accent))' } as Record<string, string>}
      >
        <Instructions
          {...(item !== undefined ? { open: item } : {})}
          onOpen={onItem}
          fetchImpl={fetchImpl}
          t={t}
          {...(locale ? { locale } : {})}
        />
      </div>
    )
  }

  if (page === 'mcp') {
    return (
      <div className="adestia-prefs adestia-prefs__page">
        <McpServers
          {...(item !== undefined ? { open: item } : {})}
          onOpen={onItem}
          fetchImpl={fetchImpl}
          t={t}
        />
      </div>
    )
  }

  return (
    <div className="adestia-prefs">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-ardoise, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          ⚙
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Settings')}</h1>
          <p className="adestia-chead__lede">{t('What this instance reaches, and what it was told')}</p>
        </div>
      </header>
      <ul className="adestia-tiles">
        <Tile
          icon="🔌"
          hue="indigo"
          label={t('MCP servers')}
          {...(health && health.length > 0 ? { subtitle: mcpLede(health, t) } : {})}
          {...(servers !== undefined
            ? { chips: [{ text: `${servers} ${servers === 1 ? t('server') : t('servers')}` }] }
            : {})}
          onOpen={() => onPage('mcp')}
          t={t}
        />
        <Tile
          icon="📓"
          hue="bleu"
          label={t('Instructions')}
          subtitle={t('Read and correct what you told the agent')}
          {...(written !== undefined
            ? { chips: [{ text: `${written} ${written === 1 ? t('file') : t('files')}` }] }
            : {})}
          onOpen={() => onPage('instructions')}
          t={t}
        />
      </ul>
    </div>
  )
}
