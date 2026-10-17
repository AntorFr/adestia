/**
 * What the shell shows instead of itself: refused, asked to sign in, unable
 * to start, or still loading (E-1, E-21).
 *
 * One centred card each — an icon, the title, the sentence, the action that
 * exists today — and every word through `t()`, in the locale the browser
 * speaks until the instance can say its own.
 */

import type { ReactNode } from 'react'

import { Icon } from './Icon.js'
import type { IconName } from './icons.js'
import { Button } from './ui/index.js'

type Say = (key: string) => string

function Gate({
  icon,
  title,
  tone,
  role,
  modifier,
  children,
}: {
  readonly icon: IconName
  readonly title: string
  readonly tone?: 'danger'
  readonly role?: 'alert' | 'status'
  readonly modifier?: string
  readonly children: ReactNode
}) {
  return (
    <main className="adestia-gate">
      <section className={modifier ? `adestia-gate__card adestia-gate__card--${modifier}` : 'adestia-gate__card'} role={role}>
        <span className={tone ? `adestia-gate__icon adestia-gate__icon--${tone}` : 'adestia-gate__icon'}>
          <Icon name={icon} />
        </span>
        <h1 className="adestia-gate__title">{title}</h1>
        {children}
      </section>
    </main>
  )
}

export function RefusedGate({ t }: { readonly t: Say }) {
  return (
    <Gate icon="circle-alert" tone="danger" role="alert" title={t('Not allowed')}>
      <p className="adestia-gate__text">
        {t(
          'You are signed in, but your account is not in a group this instance admits. Ask whoever runs it to add you.',
        )}
      </p>
      <form method="post" action="/auth/logout">
        <Button type="submit" variant="ghost">
          {t('Sign out')}
        </Button>
      </form>
    </Gate>
  )
}

export function SignInGate({ t }: { readonly t: Say }) {
  const href = `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.hash)}`
  return (
    <Gate icon="lock" title="Adestia">
      <p className="adestia-gate__text">{t('This instance requires you to sign in.')}</p>
      <a className="adestia-btn adestia-btn--accent" href={href}>
        {t('Sign in')}
      </a>
    </Gate>
  )
}

/** `offline` is a network failure (a thrown fetch), not an HTTP status: same words, another icon. */
export function FatalGate({
  t,
  message,
  offline = false,
}: {
  readonly t: Say
  readonly message: string
  readonly offline?: boolean
}) {
  return (
    <Gate icon={offline ? 'wifi-off' : 'circle-alert'} tone="danger" role="alert" modifier="fatal" title={t('Adestia could not start')}>
      <p className="adestia-gate__text adestia-gate__text--error">{message}</p>
    </Gate>
  )
}

export function LoadingGate({ t }: { readonly t: Say }) {
  return (
    <main className="adestia-gate">
      <section className="adestia-gate__card adestia-gate__card--loading" role="status">
        <span className="adestia-gate__icon">
          <Icon name="loader-circle" className="adestia-icon--spin" />
        </span>
        <p className="adestia-gate__text">{t('Loading…')}</p>
      </section>
    </main>
  )
}
