/**
 * The cog, and what belongs behind a cog.
 *
 * Settings was split in two, and the split is the whole point of this file.
 *
 * There are two different things a person means by "settings", and folding
 * them into one screen served neither. One is a handful of switches ABOUT
 * THIS SESSION — am I signed in, is the agent's token still good, is this
 * thing light or dark. Those are answered in a second, from wherever you
 * happen to be standing, and making somebody leave the screen they were on to
 * flip one is the classic way a preferences screen becomes a place people
 * dread. The other is CONTENT — the servers this instance reaches, the prose
 * it was told — which is browsed, searched and edited, and needs a canvas.
 *
 * So: the cog is a menu, and it holds the first kind. The second kind is an
 * app on the landing canvas, with tiles like everything else (`Preferences`).
 *
 * The token flow lives IN here rather than behind a door out of here. It is
 * three steps and a checkbox, and the moment somebody opens this menu is the
 * moment something has just stopped working — sending them to another screen
 * to fix it is exactly the wrong direction to move a person who is already
 * annoyed.
 */

import { useEffect, useRef, useState } from 'react'

import { Settings } from './Settings.js'
import { Button, Popover, ThemeSwitch } from './ui/index.js'

export interface SettingsMenuProps {
  /** The theme in force: `''` follows the device, `light`/`dark` override it. */
  readonly theme: string
  readonly onTheme: (theme: string) => void
  /** Only an instance that signed somebody IN can sign them out. */
  readonly signedIn?: string | undefined
  /**
   * Which build is running. Absent from a checkout, where there is no
   * release to name.
   */
  readonly version?: string | undefined
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
  readonly locale?: string
}

export function SettingsMenu({
  theme,
  onTheme,
  signedIn,
  version,
  fetchImpl = fetch,
  t = (key) => key,
  locale,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  /**
   * Escape and a press outside are the popover's (it also hands focus back to
   * the cog). What stays here is the screen changing underneath: nothing in
   * the menu navigates, so a `hashchange` is a Back, a bookmark or a link
   * elsewhere — and a panel left hovering over a screen its owner never opened
   * it on reads as stuck. Bound only while open.
   */
  useEffect(() => {
    if (!open) return undefined
    const moved = () => setOpen(false)
    window.addEventListener('hashchange', moved)
    return () => window.removeEventListener('hashchange', moved)
  }, [open])

  return (
    <div className="adestia-cog" ref={host}>
      <Button
        icon="settings"
        aria-label={t('Settings')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      />

      <Popover anchor={host} open={open} onClose={() => setOpen(false)} label={t('Settings')} className="adestia-cog__panel">
        <section className="adestia-cog__block">
          <h3 className="adestia-cog__title">{t('Tokens')}</h3>
          {/* Mounted with the menu, so an instance nobody opens the cog on
              never asks the driver for its credential state at all. */}
          <Settings fetchImpl={fetchImpl} t={t} {...(locale ? { locale } : {})} />
        </section>

        <section className="adestia-cog__block">
          <h3 className="adestia-cog__title">{t('Appearance')}</h3>
          {/* Three icons, each named: the chosen one is told by its plate and
              its accent ink, and by aria-checked — not by colour alone. */}
          <ThemeSwitch value={theme} onChange={onTheme} t={t} />
          <p className="adestia-cog__note">
            {t('Kept in this browser, like the model choice and the rail width.')}
          </p>
        </section>

        {signedIn !== undefined && (
          <section className="adestia-cog__block">
            <form method="post" action="/auth/logout">
              <Button type="submit" variant="ghost" icon="log-out" className="adestia-cog__signout">
                {t('Sign out')}
                {signedIn ? <span className="adestia-cog__who">{signedIn}</span> : null}
              </Button>
            </form>
          </section>
        )}

        {/* Which build is on screen — the one thing you come looking for when
            a deployment may or may not have landed. Here rather than on the
            canvas header: that line is diagnostics about the ENGINE, and it is
            the first thing a phone drops.

            The number is omitted, never faked: a checkout has no release to
            name, and "Adestia unknown" reads as a broken field. */}
        <p className="adestia-cog__build">
          Adestia{version ? <span className="adestia-cog__version"> {version}</span> : null}
        </p>
      </Popover>
    </div>
  )
}
