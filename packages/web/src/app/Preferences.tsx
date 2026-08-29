/**
 * Settings, as a SCREEN of the shell rather than a dialog over it.
 *
 * Two moves, and the second is what the first was for.
 *
 * The dialog it first replaced stacked the credential panel, an Instructions
 * link and the MCP readout in the order they had been written: arming a token
 * pushed everything below it down, and the MCP list sat under a dozen rows of
 * status where nobody scrolled to find it. One row per subject, each opening
 * its own page, fixed the finding — a row can say something true before you
 * open it ("2 servers — 1 needs attention"), which a section header buried
 * mid-scroll never could.
 *
 * Then the frame itself went. Settings is a DOMAIN of this instance — the
 * engine it answers with, the servers it reaches, what it looks like, what it
 * was told — not an accessory of the screen you happened to be on. So it is
 * an app: its own tile on the landing canvas, its own address (`#/settings`,
 * one per page below it), the shell's breadcrumb naming where you are, and
 * the whole width of the canvas to say it in. That last part is not comfort:
 * Instructions used to be a DOOR out of the dialog, because prose is not
 * edited in a box 520px wide. On a screen there is no box to leave, so it is
 * a page in here like the rest.
 *
 * Still controlled rather than self-navigating: the URL is the navigation
 * state of this product — all of it — and a screen keeping its own idea of
 * which page is open would be a second one to disagree with the address bar.
 */

import { Instructions } from './Instructions.js'
import { McpPanel, Settings, useMcpServers, type McpServerHealth } from './Settings.js'

/** Which settings page is open. `''` is the list itself. */
export type PrefsPage = '' | 'credential' | 'mcp' | 'appearance' | 'instructions'

/** The pages that have an address. A closed set: `#/settings/…` is public. */
const PAGES = ['credential', 'mcp', 'appearance', 'instructions'] as const

/**
 * Whether a URL segment names a page.
 *
 * The address bar is user-writable, so `#/settings/whatever` has to resolve to
 * something. Answering here lets the shell send it back to the list rather
 * than render a screen with nothing on it under a title that lies.
 */
export function isPrefsPage(value: string): value is Exclude<PrefsPage, ''> {
  return (PAGES as readonly string[]).includes(value)
}

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

/** The theme choices, in the order they are offered. `''` follows the device. */
const THEMES = [
  { value: '', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

/** What the appearance row says shut: the choice in force, not a description. */
export function themeLede(theme: string, t: (key: string) => string): string {
  const found = THEMES.find((choice) => choice.value === theme) ?? THEMES[0]
  return found.value === '' ? t('Follows this device') : t(found.label)
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
        className="demeura-prefs__row"
        style={{ '--tile-color': `var(--demeura-hue-${hue}, var(--accent))` } as Record<string, string>}
        onClick={onOpen}
      >
        <span className="demeura-prefs__plate" aria-hidden="true">
          {glyph}
        </span>
        <span className="demeura-prefs__body">
          <span className="demeura-prefs__title">{title}</span>
          <span className="demeura-prefs__lede">{lede}</span>
        </span>
        <span className="demeura-prefs__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  )
}

/** The head of a page, dressed like every other screen of the canvas. */
function PageHead({
  glyph,
  hue,
  title,
  lede,
}: {
  glyph: string
  hue: string
  title: string
  lede: string
}) {
  return (
    <header
      className="demeura-chead"
      style={{ '--tile-color': `var(--demeura-hue-${hue}, var(--accent))` } as Record<string, string>}
    >
      <span className="demeura-chead__icon" aria-hidden="true">
        {glyph}
      </span>
      <div>
        <h1 className="demeura-chead__title">{title}</h1>
        <p className="demeura-chead__lede">{lede}</p>
      </div>
    </header>
  )
}

export interface PreferencesProps {
  readonly page: PrefsPage
  readonly onPage: (page: PrefsPage) => void
  /** The theme in force: `''` follows the device, `light`/`dark` override it. */
  readonly theme?: string
  readonly onTheme?: (theme: string) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

/** What the screen is called, for the page now open. */
export function prefsTitle(page: PrefsPage, t: (key: string) => string): string {
  if (page === 'credential') return t('Agent credential')
  if (page === 'mcp') return t('MCP servers')
  if (page === 'appearance') return t('Appearance')
  if (page === 'instructions') return t('Instructions')
  return t('Settings')
}

export function Preferences({
  page,
  onPage,
  theme = '',
  onTheme,
  fetchImpl = fetch,
  t = (key) => key,
}: PreferencesProps) {
  // Fetched once, at the list: the row needs the count to describe itself,
  // and the page needs the servers to draw them.
  const servers = useMcpServers(fetchImpl)

  if (page === 'instructions') {
    // The one page that heads itself: the instruction zone is a screen in its
    // own right and was one before settings became a screen at all. It is
    // handed the hue of the row that opened it, so the plate a finger just
    // pressed is the plate at the top of the screen it landed on.
    return (
      <div
        className="demeura-prefs demeura-prefs__page"
        style={{ '--tile-color': 'var(--demeura-hue-bleu, var(--accent))' } as Record<string, string>}
      >
        <Instructions fetchImpl={fetchImpl} t={t} />
      </div>
    )
  }

  if (page === 'credential') {
    return (
      <div className="demeura-prefs demeura-prefs__page">
        <PageHead
          glyph="🔑"
          hue="ambre"
          title={t('Agent credential')}
          lede={t('Arm or renew the token this instance answers with')}
        />
        <Settings fetchImpl={fetchImpl} t={t} />
      </div>
    )
  }

  if (page === 'mcp') {
    return (
      <div className="demeura-prefs demeura-prefs__page">
        <PageHead
          glyph="🔌"
          hue="indigo"
          title={t('MCP servers')}
          lede={t('What this instance reaches, and what it is doing about it')}
        />
        <McpPanel fetchImpl={fetchImpl} servers={servers} t={t} />
      </div>
    )
  }

  if (page === 'appearance') {
    return (
      <div className="demeura-prefs demeura-prefs__page">
        <PageHead
          glyph="◐"
          hue="violet"
          title={t('Appearance')}
          lede={t('Light or dark, or whatever this device is set to')}
        />
        {/* Named choices rather than the header's cycling button: three
            buttons SAY which one is in force, where a glyph that changes
            nothing visible until you click it can only be inferred. */}
        <div className="demeura-choices" role="radiogroup" aria-label={t('Appearance')}>
          {THEMES.map((choice) => (
            <button
              key={choice.value || 'system'}
              type="button"
              role="radio"
              aria-checked={theme === choice.value}
              className="demeura-choices__choice"
              onClick={() => onTheme?.(choice.value)}
            >
              {t(choice.label)}
            </button>
          ))}
        </div>
        <p className="demeura-prefs__note">
          {t('Kept in this browser, like the model choice and the rail width.')}
        </p>
      </div>
    )
  }

  return (
    <div className="demeura-prefs">
      <PageHead
        glyph="⚙"
        hue="ardoise"
        title={t('Settings')}
        lede={t('What this instance answers with, reaches, looks like and was told')}
      />
      <ul className="demeura-prefs__list">
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
          glyph="◐"
          hue="violet"
          title={t('Appearance')}
          lede={themeLede(theme, t)}
          onOpen={() => onPage('appearance')}
        />
        <Row
          glyph="📓"
          hue="bleu"
          title={t('Instructions')}
          lede={t('Read and correct what you told the agent')}
          onOpen={() => onPage('instructions')}
        />
      </ul>
    </div>
  )
}
