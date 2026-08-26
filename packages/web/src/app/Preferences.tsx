/**
 * Settings, as a screen of cards rather than one long scroll.
 *
 * What it replaced: the credential panel, an Instructions link and the MCP
 * readout stacked in a single dialog, in that order, because that is the
 * order they were written in. Three unrelated things sharing one surface —
 * arming a token pushed everything below it down, and the MCP list sat under
 * a dozen rows of status where nobody scrolled to find it.
 *
 * What it is now: one row per subject, each opening its own page. The shape
 * is the one every phone already teaches — a plate, a title, a line saying
 * what is in there, a chevron — and its virtue is not familiarity but
 * ADDRESSING: a row can say something true before you open it ("three
 * servers, one needs a sign-in"), which a section header buried mid-scroll
 * never could.
 *
 * Controlled rather than self-navigating: the dialog around it has to name
 * the page in its own header, and a screen that knew where it was while its
 * frame did not would be two titles disagreeing in the same box.
 */

import { McpPanel, Settings, useMcpServers, type McpServerHealth } from './Settings.js'

/** Which page of the settings screen is open. `''` is the list itself. */
export type PrefsPage = '' | 'credential' | 'mcp'

/**
 * A row's lede, from what the driver actually reports.
 *
 * Counted rather than described: "3 servers" is a fact this instance can
 * check, and a row that promised "manage your servers" would be a row that
 * says the same thing on an instance with none.
 */
export function mcpLede(
  servers: readonly McpServerHealth[],
  t: (key: string) => string,
): string {
  const attention = servers.filter(
    (server) => server.state === 'failed' || server.state === 'needs-auth',
  ).length
  const counted = `${servers.length} ${servers.length === 1 ? t('server') : t('servers')}`
  // The exception is what earns the second half of the sentence: a row that
  // always ended "— all well" would be a row nobody reads.
  return attention > 0 ? `${counted} — ${t('%n need attention').replace('%n', String(attention))}` : counted
}

/** One row of the list. The plate's hue is a token name, never a colour. */
function Row({
  glyph,
  hue,
  title,
  lede,
  onOpen,
}: {
  glyph: string
  hue: string
  title: string
  lede: string
  onOpen: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className="golem-prefs__row"
        style={{ '--tile-color': `var(--golem-hue-${hue}, var(--accent))` } as Record<string, string>}
        onClick={onOpen}
      >
        <span className="golem-prefs__plate" aria-hidden="true">
          {glyph}
        </span>
        <span className="golem-prefs__body">
          <span className="golem-prefs__title">{title}</span>
          <span className="golem-prefs__lede">{lede}</span>
        </span>
        <span className="golem-prefs__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  )
}

export interface PreferencesProps {
  readonly page: PrefsPage
  readonly onPage: (page: PrefsPage) => void
  /**
   * Leaves the dialog for the full instruction screen.
   *
   * Instructions are the one subject that does NOT become a page in here:
   * editing prose in a dialog is cramped, and the screen already exists. The
   * row is a door, and the chevron says so exactly as the others do.
   */
  readonly onOpenInstructions: () => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

/** What the dialog around it should be called, for the page now open. */
export function prefsTitle(page: PrefsPage, t: (key: string) => string): string {
  if (page === 'credential') return t('Agent credential')
  if (page === 'mcp') return t('MCP servers')
  return t('Settings')
}

export function Preferences({
  page,
  onPage,
  onOpenInstructions,
  fetchImpl = fetch,
  t = (key) => key,
}: PreferencesProps) {
  // Fetched once, at the list: the row needs the count to describe itself,
  // and the page needs the servers to draw them.
  const servers = useMcpServers(fetchImpl)

  if (page !== '') {
    return (
      <div className="golem-prefs">
        <button type="button" className="golem-prefs__back" onClick={() => onPage('')}>
          ‹ {t('Settings')}
        </button>
        {page === 'credential' ? (
          <Settings fetchImpl={fetchImpl} t={t} />
        ) : (
          <McpPanel fetchImpl={fetchImpl} servers={servers} t={t} />
        )}
      </div>
    )
  }

  return (
    <div className="golem-prefs">
      <ul className="golem-prefs__list">
        <Row
          glyph="🔑"
          hue="ambre"
          title={t('Agent credential')}
          lede={t('Arm or renew the token this instance answers with')}
          onOpen={() => onPage('credential')}
        />
        {/* Only when the driver reports at all. An MCP row on an engine that
            cannot answer would open a page with nothing on it — the exact
            failure the panel's own 404 handling exists to avoid. */}
        {servers !== undefined && servers.length > 0 && (
          <Row
            glyph="🔌"
            hue="indigo"
            title={t('MCP servers')}
            lede={mcpLede(servers, t)}
            onOpen={() => onPage('mcp')}
          />
        )}
        <Row
          glyph="📓"
          hue="bleu"
          title={t('Instructions')}
          lede={t('Read and correct what you told the agent')}
          onOpen={onOpenInstructions}
        />
      </ul>
    </div>
  )
}
