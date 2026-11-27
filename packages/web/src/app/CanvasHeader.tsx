/**
 * The canvas header: the way back to the chat on a phone, the breadcrumb, the
 * engine's label and the place the settings menu sits.
 *
 * It depends on the trail and the instance, never on the screen under it.
 */

import { Fragment } from 'react'

import { BackButton } from './BackButton.js'
import { SettingsMenu } from './SettingsMenu.js'
import type { Crumb } from './trail.js'
import type { InstanceInfo } from './useInstance.js'

export function CanvasHeader({
  mobile,
  onChat,
  trail,
  goHome,
  openSection,
  instance,
  theme,
  onTheme,
  fetchImpl,
  locale,
  t,
}: {
  readonly mobile: boolean
  /** Back to the chat, on a phone where the two screens are folded. */
  readonly onChat: () => void
  readonly trail: readonly Crumb[]
  readonly goHome: () => void
  readonly openSection: (path: string) => void
  readonly instance: InstanceInfo
  readonly theme: string
  readonly onTheme: (theme: string) => void
  readonly fetchImpl: typeof fetch
  readonly locale: string
  readonly t: (key: string) => string
}) {
  return (
    <header className="adestia-canvas__header">
      {/* Folded onto one screen, the canvas needs its own way back — the
          CSS alone would hide it with no route to it at all. */}
      {mobile && (
        <BackButton
          label={t('Chat')}
          onClick={onChat}
          aria-label={t('Back to the chat')}
        />
      )}
      {/* Where you are, in the apparatus voice. The brand moved to the
          rail: this side of the gutter is about PLACE, not identity. */}
      <nav className="adestia-crumbs" aria-label={t('Breadcrumb')}>
        <button
          type="button"
          onClick={goHome}
        >
          {t('Home')}
        </button>
        {trail.map((crumb, index) => {
          // The last crumb is where the reader IS: named, never a link to
          // the screen already under their eyes. Every one above it is a
          // way BACK — the trail has to be walkable, not decorative — and
          // it walks to wherever that folder actually opens, which for a
          // folder an app owns is the app.
          const leads = crumb.folder ?? crumb.route
          const walkable = leads !== undefined && index < trail.length - 1
          // A folder is resolved (it may belong to an app); a route the
          // plugin gave is already an address and is taken as written.
          const walk = () =>
            crumb.folder === undefined
              ? (location.hash = crumb.route as string)
              : openSection(crumb.folder)
          return (
            <Fragment key={`${leads ?? ''}-${index}`}>
              <span className="adestia-crumbs__sep">/</span>
              {walkable ? (
                <button type="button" onClick={walk}>
                  {crumb.label}
                </button>
              ) : (
                <b>{crumb.label}</b>
              )}
            </Fragment>
          )
        })}
      </nav>
      <span className="adestia-canvas__driver">
        {/* The version only becomes knowable once a session has announced
            itself, so before the first turn there is nothing to show.
            "Claude Code unknown" reads as a broken field; the name alone
            reads as a name. */}
        {instance.driver.label}
        {instance.driver.cliVersion && instance.driver.cliVersion !== 'unknown'
          ? ` ${instance.driver.cliVersion}`
          : ''}
      </span>
      {/* A MENU, not a shortcut into a screen. What sits behind it is the
          three things somebody settles without leaving the page they are
          on: is the agent's token still good, is this light or dark, and
          am I signing out. The cycling ◐ that used to stand beside it
          went inside as three named choices — a glyph that changes
          nothing visible until you press it can only be inferred.

          What is NOT here is content: the servers and the instructions
          are an app on the canvas, reached from its tile. */}
      <SettingsMenu
        theme={theme}
        onTheme={onTheme}
        {...(instance.auth.mode === 'oidc'
          ? { signedIn: instance.user?.displayName ?? '' }
          : {})}
        {...(instance.version ? { version: instance.version } : {})}
        fetchImpl={fetchImpl}
        t={t}
        locale={locale}
      />
    </header>
  )
}
