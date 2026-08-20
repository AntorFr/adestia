/**
 * Is the shell folded onto one screen?
 *
 * The breakpoint is read from the CSS token rather than repeated here: a
 * layout whose JS and CSS disagree about where "mobile" starts flickers on
 * resize, and the disagreement is invisible until someone drags a window.
 */

import { useEffect, useState } from 'react'

const FALLBACK = 820

export function mobileBreakpoint(): number {
  if (typeof getComputedStyle === 'undefined') return FALLBACK
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--breakpoint-mobile')
    .trim()
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : FALLBACK
}

export function useMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= mobileBreakpoint(),
  )

  useEffect(() => {
    // Guarded because an unavailable browser API thrown from an effect tears
    // down the whole render — the shell must not disappear because one media
    // query API is missing. The resize fallback covers the same ground with
    // more work and no correctness loss.
    if (typeof window.matchMedia !== 'function') {
      const update = () => setMobile(window.innerWidth <= mobileBreakpoint())
      update()
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const query = window.matchMedia(`(max-width: ${mobileBreakpoint()}px)`)
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return mobile
}
