/**
 * Mounts a skin's living slot into React.
 *
 * The same coexistence rule the atelier port proved: the skin renders into an
 * element it is handed and NOTHING else touches that subtree, so imperative
 * DOM and React never fight over the same nodes.
 *
 * A slot that throws costs its own box, never the shell — same doctrine as
 * PluginBoundary, applied at mount time because that is when imperative code
 * fails. The teardown is the slot's own (stopping a rabbit's ears, an
 * animation frame loop); the host is emptied afterwards regardless, so a slot
 * that forgot its teardown still cannot leak markup into the next livery.
 */

import { useEffect, useRef } from 'react'

import type { SkinSlotContext, SkinSlotRender } from './skin.js'

export function SkinSlot({
  render,
  context,
  className,
}: {
  readonly render: SkinSlotRender
  readonly context: SkinSlotContext
  readonly className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  // Read through a ref so a new context object does not remount the slot:
  // remounting on every render would restart animations mid-beat.
  const current = useRef(context)
  current.current = context

  useEffect(() => {
    const element = host.current
    if (!element) return undefined

    let teardown: (() => void) | void
    try {
      teardown = render(element, {
        ask: (prompt) => current.current.ask(prompt),
        compose: (text) => current.current.compose(text),
        focusComposer: () => current.current.focusComposer(),
        ...(current.current.instance ? { instance: current.current.instance } : {}),
      })
    } catch (error) {
      console.error('skin slot failed to render:', error)
      return undefined
    }

    return () => {
      try {
        teardown?.()
      } catch {
        /* a teardown that throws must not block the unmount */
      }
      element.replaceChildren()
    }
  }, [render])

  return <div {...(className ? { className } : {})} ref={host} />
}
