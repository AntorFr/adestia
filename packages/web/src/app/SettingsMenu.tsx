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

/** The theme choices, in the order they are offered. `''` follows the device. */
export const THEMES = [
  { value: '', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

/** What the appearance line says: the choice in force, not a description. */
export function themeLede(theme: string, t: (key: string) => string): string {
  const found = THEMES.find((choice) => choice.value === theme) ?? THEMES[0]
  return found.value === '' ? t('Follows this device') : t(found.label)
}

export interface SettingsMenuProps {
  /** The theme in force: `''` follows the device, `light`/`dark` override it. */
  readonly theme: string
  readonly onTheme: (theme: string) => void
  /** Only an instance that signed somebody IN can sign them out. */
  readonly signedIn?: string | undefined
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

export function SettingsMenu({
  theme,
  onTheme,
  signedIn,
  fetchImpl = fetch,
  t = (key) => key,
}: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  /**
   * Closing, by the two gestures every menu owes a person.
   *
   * Bound only while open, so a shell with the menu shut carries no document
   * listeners at all. `pointerdown` rather than `click`: a click that starts
   * inside the panel and ends outside it — a drag on the code field, say —
   * would close the menu mid-gesture on `click`.
   */
  useEffect(() => {
    if (!open) return undefined
    const away = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    // And when the screen underneath changes. Nothing in here navigates, so
    // this only ever fires on a Back, a bookmark or a link elsewhere — and a
    // menu left hovering over a screen its owner never opened it on reads as
    // a panel that is stuck. Photographed once, on a phone, where the panel
    // covers most of what it is floating over.
    const moved = () => setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    window.addEventListener('hashchange', moved)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('hashchange', moved)
    }
  }, [open])

  return (
    <div className="adestia-cog" ref={host}>
      <button
        type="button"
        className="adestia-ib"
        onClick={() => setOpen(!open)}
        aria-label={t('Settings')}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ⚙
      </button>

      {open && (
        <div className="adestia-cog__panel" role="dialog" aria-label={t('Settings')}>
          <section className="adestia-cog__block">
            <h3 className="adestia-cog__title">{t('Tokens')}</h3>
            {/* Mounted with the menu, so an instance nobody opens the cog on
                never asks the driver for its credential state at all. */}
            <Settings fetchImpl={fetchImpl} t={t} />
          </section>

          <section className="adestia-cog__block">
            <h3 className="adestia-cog__title">{t('Appearance')}</h3>
            {/* Named choices rather than the cycling glyph this menu replaced:
                three buttons SAY which one is in force, where a glyph that
                changes nothing visible until you click it can only be
                inferred. */}
            <div className="adestia-choices" role="radiogroup" aria-label={t('Appearance')}>
              {THEMES.map((choice) => (
                <button
                  key={choice.value || 'system'}
                  type="button"
                  role="radio"
                  aria-checked={theme === choice.value}
                  className="adestia-choices__choice"
                  onClick={() => onTheme(choice.value)}
                >
                  {t(choice.label)}
                </button>
              ))}
            </div>
            <p className="adestia-cog__note">
              {t('Kept in this browser, like the model choice and the rail width.')}
            </p>
          </section>

          {signedIn !== undefined && (
            <section className="adestia-cog__block">
              <form method="post" action="/auth/logout">
                <button type="submit" className="adestia-cog__signout">
                  {t('Sign out')}
                  {signedIn ? <span className="adestia-cog__who">{signedIn}</span> : null}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
