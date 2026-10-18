import type { ReactNode } from 'react'

import { Icon } from '../../app/Icon.js'
import type { IconName } from '../../app/icons.js'
import type { Ctx } from './types.js'

/** The words of the reader, in the language of the page it draws. */
export function sayOf(ctx: Ctx): (key: string) => string {
  return ctx.t ?? ((key) => key)
}

/**
 * What a block says when it cannot do its job: the inline empty state of the
 * charte (`.adestia-empty--inline`), one form for every note. The class
 * `.adestia-block-note` stays on it — the reader's layout and the skins hook it.
 */
export function Note({
  icon = 'info',
  className,
  children,
}: {
  readonly icon?: IconName
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <p className={`adestia-block-note adestia-empty adestia-empty--inline${className ? ` ${className}` : ''}`}>
      <span className="adestia-empty__icon"><Icon name={icon} /></span>
      <span className="adestia-empty__text">{children}</span>
    </p>
  )
}
