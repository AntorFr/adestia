import { useRef, type KeyboardEvent, type RefObject } from 'react'

/**
 * The roving behaviour of a radiogroup (docs/charte.md § 4): one Tab stop (the checked
 * option, else the first), arrows choose AND move the focus, Home and End go to the ends.
 * `onPick(index)` receives the option to check.
 */
export function useRadioGroup(count: number, checkedIndex: number, onPick: (index: number) => void) {
  const group: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement>(null)
  const tabIndexOf = (index: number) => (index === (checkedIndex < 0 ? 0 : checkedIndex) ? 0 : -1)
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    let at = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') at = (index + 1) % count
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') at = (index - 1 + count) % count
    else if (event.key === 'Home') at = 0
    else if (event.key === 'End') at = count - 1
    else return
    event.preventDefault()
    onPick(at)
    group.current?.querySelectorAll<HTMLElement>('[role=radio]')[at]?.focus()
  }
  return { group, tabIndexOf, onKeyDown }
}
